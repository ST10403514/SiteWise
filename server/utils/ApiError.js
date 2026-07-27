'use strict';

/** Operational error carrying an HTTP status code. */
class ApiError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} message Human-readable message (safe to expose to client)
   */
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  static badRequest(message)   { return new ApiError(400, message); }
  static unauthorized(message) { return new ApiError(401, message); }
  static conflict(message)     { return new ApiError(409, message); }
}

module.exports = ApiError;
