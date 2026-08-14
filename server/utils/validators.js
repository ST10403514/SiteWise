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

  // Requires the WHOLE string to be a well-formed base64 image data URL, not
  // just the prefix. A prefix-only check would let a value like
  // `data:image/png,x"><script>` through, which breaks out of the
  // `<img src="...">` markup some pages build with template literals.
  optionalDataUrlImage(value, field, { maxBytes = 1.5 * 1024 * 1024 } = {}) {
    if (!value) return '';
    if (typeof value !== 'string' || value.length > maxBytes) {
      throw ApiError.badRequest(value && value.length > maxBytes ? `${field} is too large` : `${field} must be an image`);
    }
    if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) {
      throw ApiError.badRequest(`${field} must be an image`);
    }
    return value;
  },
};

module.exports = validators;
