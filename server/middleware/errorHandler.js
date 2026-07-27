'use strict';

const ApiError = require('../utils/ApiError');

/** Final error middleware - maps errors to JSON responses. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Upload is too large' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
}

module.exports = errorHandler;
