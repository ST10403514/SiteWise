'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Factory for the authentication guard.
 * Reads the session cookie, verifies it and attaches `req.user`.
 */
function requireAuth({ tokenService, userRepository, cookieName }) {
  return (req, _res, next) => {
    const token = req.cookies?.[cookieName];
    const userId = token ? tokenService.verify(token) : null;
    const user = userId ? userRepository.findById(userId) : null;
    if (!user) return next(ApiError.unauthorized('Please sign in'));
    req.user = user;
    next();
  };
}

module.exports = requireAuth;
