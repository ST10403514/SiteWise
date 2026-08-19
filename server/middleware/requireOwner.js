'use strict';

const ApiError = require('../utils/ApiError');

/** Gates an action to the business's owner. Must run after authGuard. */
function requireOwner(req, _res, next) {
  if (!req.user?.isOwner) return next(ApiError.forbidden('Only the account owner can do this'));
  next();
}

module.exports = requireOwner;
