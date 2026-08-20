'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Factory for the authentication guard.
 * Reads the session cookie, verifies it and attaches `req.user`.
 *
 * findById is now async (libSQL), so the guard is async and awaits it;
 * any lookup error is forwarded to the error handler rather than thrown
 * as an unhandled rejection.
 */
function requireAuth({ tokenService, userRepository, businessRepository, cookieName }) {
  return async (req, _res, next) => {
    try {
      const token = req.cookies?.[cookieName];
      const claims = token ? tokenService.verify(token) : null;
      const user = claims ? await userRepository.findById(claims.id) : null;
      if (!user) return next(ApiError.unauthorized('Please sign in'));
      // Reject tokens issued before the user's last password change, so a
      // reset (e.g. after a suspected leak) kills any stolen session too,
      // instead of it surviving until the token's own 7-day expiry.
      if (user.passwordChangedAt) {
        const changedAtSec = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
        if (claims.issuedAt < changedAtSec) {
          return next(ApiError.unauthorized('Please sign in again'));
        }
      }
      // A login's `profile` no longer lives on the user row - it's the
      // business's, shared by every team member on it. Attaching it here
      // means every downstream controller can keep reading req.user.profile
      // exactly as before, with no idea a business even exists. Same for
      // `tier`, which gates the invite flow (TeamService.invite).
      const business = user.businessId ? await businessRepository.findById(user.businessId) : null;
      user.profile = business ? business.profile : null;
      user.tier = business ? business.tier : 'solo';
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = requireAuth;