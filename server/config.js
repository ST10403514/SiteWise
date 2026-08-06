'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Central application configuration.
 *
 * Works in two environments without code changes:
 *   - Local dev: data lives in server/data, the database is a local libSQL
 *     file (file:...), and the JWT secret is auto-generated once.
 *   - Production (Render): the database is Turso, reached via TURSO_URL and
 *     TURSO_AUTH_TOKEN, and JWT_SECRET is provided as an environment variable.
 */
class Config {
  constructor() {
    this.port = Number(process.env.PORT) || 3000;

    // DATA_DIR still hosts local dev artifacts (the dev libSQL file and the
    // auto-generated JWT secret). In production the database is Turso, so this
    // directory is only relevant for local development.
    this.dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');

    this.usersFile = path.join(this.dataDir, 'users.json'); // legacy, retired stores
    this.jobsFile = path.join(this.dataDir, 'jobs.json');   // legacy, retired stores
    this.dbFile = path.join(this.dataDir, 'sitewise.db');

    this.publicDir = path.join(__dirname, '..', 'public');
    this.cookieName = 'ssp_session';
    this.tokenTtl = '7d';
    this.cookieMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
    this.isProduction = process.env.NODE_ENV === 'production';
    this.jwtSecret = process.env.JWT_SECRET || this._loadOrCreateSecret();

    // ── Database connection (libSQL / Turso) ───────────────────────────────
    // Production MUST use Turso. Falling back to a local file on Render's
    // ephemeral disk is exactly the data-loss bug this migration fixes, so we
    // fail fast if TURSO_URL is missing in production.
    if (this.isProduction && !process.env.TURSO_URL) {
      throw new Error(
        'TURSO_URL environment variable is required in production. ' +
        'Set TURSO_URL (and TURSO_AUTH_TOKEN) in your host\'s environment settings.'
      );
    }

    this.db = {
      // Dev falls back to a local libSQL file so nothing external is needed.
      url: process.env.TURSO_URL || `file:${this.dbFile}`,
      authToken: process.env.TURSO_AUTH_TOKEN, // undefined is fine for file: URLs
    };

    // Ensure the local data dir exists when using a file: database in dev.
    if (this.db.url.startsWith('file:')) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
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