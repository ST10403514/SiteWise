'use strict';

const ApiError = require('./ApiError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Field-level validation helpers shared by controllers. */
const validators = {
  requireString(value, field, { min = 1, max = 200 } = {}) {
    if (typeof value !== 'string' || value.trim().length < min) {
      throw ApiError.badRequest(`${field} is required`);
    }
    if (value.length > max) {
      throw ApiError.badRequest(`${field} must be at most ${max} characters`);
    }
    return value.trim();
  },

  requireEmail(value) {
    const email = this.requireString(value, 'Email', { max: 254 }).toLowerCase();
    if (!EMAIL_RE.test(email)) throw ApiError.badRequest('Enter a valid email address');
    return email;
  },

  requirePassword(value) {
    if (typeof value !== 'string' || value.length < 8) {
      throw ApiError.badRequest('Password must be at least 8 characters');
    }
    if (value.length > 128) throw ApiError.badRequest('Password is too long');
    return value;
  },

  optionalString(value, field, { max = 500 } = {}) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string') throw ApiError.badRequest(`${field} must be text`);
    if (value.length > max) {
      throw ApiError.badRequest(`${field} must be at most ${max} characters`);
    }
    return value.trim();
  },

  optionalDataUrlImage(value, field, { maxBytes = 1.5 * 1024 * 1024 } = {}) {
    if (!value) return '';
    if (typeof value !== 'string' || !value.startsWith('data:image/')) {
      throw ApiError.badRequest(`${field} must be an image`);
    }
    if (value.length > maxBytes) {
      throw ApiError.badRequest(`${field} is too large`);
    }
    return value;
  },
};

module.exports = validators;
