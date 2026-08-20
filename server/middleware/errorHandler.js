'use strict';

const Sentry = require('@sentry/node');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/** Final error middleware - maps errors to JSON responses. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // ApiError and oversized-upload are expected outcomes (bad input, a
  // forbidden cross-tenant access attempt, etc.), not bugs - only report
  // the genuinely unexpected branch below to Sentry, or every 404/403 would
  // burn the free-tier quota on non-issues.
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Upload is too large' });
  }
  // A malformed request body (broken JSON) is a bad request, not a server
  // bug - without this it falls through to the 500 branch below and burns
  // Sentry's free-tier quota on every stray/scanner request that sends junk.
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed request body' });
  }
  logger.error({ err, path: req.originalUrl, method: req.method }, err.message);
  Sentry.captureException(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
}

module.exports = errorHandler;
