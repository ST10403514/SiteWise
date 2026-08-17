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
    return jwt.sign({ sub: user.id }, this._secret, { expiresIn: this._ttl, algorithm: 'HS256' });
  }

  /**
   * @param {string} token
   * @returns {{id: string, issuedAt: number}|null} the user id and the
   *   token's issued-at time (seconds since epoch), or null if invalid/expired.
   *   issuedAt lets callers reject tokens issued before a password change.
   */
  verify(token) {
    try {
      // Pinning the algorithm defends against algorithm-confusion attacks -
      // without it, jsonwebtoken accepts whatever alg the token itself claims.
      const payload = jwt.verify(token, this._secret, { algorithms: ['HS256'] });
      return { id: payload.sub, issuedAt: payload.iat };
    } catch {
      return null;
    }
  }
}

module.exports = TokenService;
