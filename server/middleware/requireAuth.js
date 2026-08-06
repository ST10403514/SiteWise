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
function requireAuth({ tokenService, userRepository, cookieName }) {
  return async (req, _res, next) => {
    try {
      const token = req.cookies?.[cookieName];
      const userId = token ? tokenService.verify(token) : null;
      const user = userId ? await userRepository.findById(userId) : null;
      if (!user) return next(ApiError.unauthorized('Please sign in'));
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = requireAuth;