'use strict';

const ApiError = require('../utils/ApiError');
const { jobQuota, effectiveTier } = require('../utils/jobQuota');

/**
 * Factory for the authentication guard.
 * Reads the session cookie, verifies it and attaches `req.user`.
 *
 * findByIdWithBusiness is async (libSQL), so the guard is async and awaits
 * it; any lookup error is forwarded to the error handler rather than thrown
 * as an unhandled rejection.
 */
function requireAuth({ tokenService, userRepository, cookieName }) {
  return async (req, _res, next) => {
    try {
      const token = req.cookies?.[cookieName];
      const claims = token ? tokenService.verify(token) : null;
      // One round trip for both the user and their business (LEFT JOIN) -
      // this runs on every authenticated request, so the two sequential
      // fetches this used to be were the single biggest source of
      // avoidable per-request DB latency in the app.
      const { user, business } = claims
        ? await userRepository.findByIdWithBusiness(claims.id)
        : { user: null, business: null };
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
      // `tier` (gates TeamService.invite) and `jobQuota` (gates
      // JobController.save) - computed here from the same fetched row
      // rather than queried again wherever it's needed.
      user.profile = business ? business.profile : null;
      user.tier = business ? effectiveTier(business) : 'free';
      user.jobQuota = business ? jobQuota(business) : null;
      user.subscriptionStatus = business ? business.subscriptionStatus : null;
      user.subscriptionRenewsAt = business ? business.subscriptionRenewsAt : null;
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = requireAuth;