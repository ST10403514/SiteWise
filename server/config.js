'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Central application configuration.
 *
 * Works in two environments without code changes:
 *   - Local dev: data lives in server/data, JWT secret auto-generated once.
 *   - Production (Render): set DATA_DIR to a persistent disk mount (e.g. /data)
 *     and JWT_SECRET as an environment variable. Both are read from env below.
 */
class Config {
  constructor() {
    this.port = Number(process.env.PORT) || 3000;

    // DATA_DIR lets the host point storage at a persistent disk.
    // Falls back to the local server/data folder for development.
    this.dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');

    this.usersFile = path.join(this.dataDir, 'users.json');
    this.jobsFile = path.join(this.dataDir, 'jobs.json');
    this.dbFile = path.join(this.dataDir, 'sitewise.db');

    this.publicDir = path.join(__dirname, '..', 'public');
    this.cookieName = 'ssp_session';
    this.tokenTtl = '7d';
    this.cookieMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
    this.isProduction = process.env.NODE_ENV === 'production';
    this.jwtSecret = process.env.JWT_SECRET || this._loadOrCreateSecret();
  }

  _loadOrCreateSecret() {
    // In production a stable JWT_SECRET must be provided via the environment,
    // otherwise every restart/redeploy would invalidate all sessions.
    if (this.isProduction) {
      throw new Error(
        'JWT_SECRET environment variable is required in production. ' +
        'Set it in your host\'s environment settings.'
      );
    }
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