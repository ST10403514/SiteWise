'use strict';

const jwt = require('jsonwebtoken');

/** Issues and verifies signed session tokens. */
class TokenService {
  /**
   * @param {string} secret HMAC secret
   * @param {string} ttl e.g. '7d'
   */
  constructor(secret, ttl) {
    this._secret = secret;
    this._ttl = ttl;
  }

  /** @param {{id: string}} user */
  issue(user) {
    return jwt.sign({ sub: user.id }, this._secret, { expiresIn: this._ttl });
  }

  /**
   * @param {string} token
   * @returns {string|null} the user id, or null if invalid/expired
   */
  verify(token) {
    try {
      return jwt.verify(token, this._secret).sub;
    } catch {
      return null;
    }
  }
}

module.exports = TokenService;
