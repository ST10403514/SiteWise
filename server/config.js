'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Central application configuration.
 * The JWT secret is taken from the environment when provided; otherwise a
 * random secret is generated once and persisted so sessions survive restarts.
 */
class Config {
  constructor() {
    this.port = Number(process.env.PORT) || 3000;
    this.dataDir = path.join(__dirname, 'data');
    this.usersFile = path.join(this.dataDir, 'users.json');
    this.jobsFile = path.join(this.dataDir, 'jobs.json');
    this.publicDir = path.join(__dirname, '..', 'public');
    this.cookieName = 'ssp_session';
    this.tokenTtl = '7d';
    this.cookieMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
    this.isProduction = process.env.NODE_ENV === 'production';
    this.jwtSecret = process.env.JWT_SECRET || this._loadOrCreateSecret();
  }

  _loadOrCreateSecret() {
    const secretFile = path.join(this.dataDir, '.jwt-secret');
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (fs.existsSync(secretFile)) {
      return fs.readFileSync(secretFile, 'utf8').trim();
    }
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
    return secret;
  }
}

module.exports = new Config();
