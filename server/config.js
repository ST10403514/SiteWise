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
 *
 * Photo storage (Cloudflare R2) is read from R2_* environment variables.
 */
class Config {
  constructor() {
    this.port = Number(process.env.PORT) || 3000;

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
    if (this.isProduction && !process.env.TURSO_URL) {
      throw new Error(
        'TURSO_URL environment variable is required in production. ' +
        'Set TURSO_URL (and TURSO_AUTH_TOKEN) in your host\'s environment settings.'
      );
    }
    this.db = {
      url: process.env.TURSO_URL || `file:${this.dbFile}`,
      authToken: process.env.TURSO_AUTH_TOKEN,
    };
    if (this.db.url.startsWith('file:')) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // ── Photo storage (Cloudflare R2) ──────────────────────────────────────
    this.r2 = {
      accountId: process.env.R2_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucket: process.env.R2_BUCKET,
      publicUrl: process.env.R2_PUBLIC_URL,
    };
    // In production, photo uploads must have somewhere to go. Fail fast if the
    // R2 settings are incomplete rather than erroring on the first upload.
    if (this.isProduction) {
      const missing = Object.entries(this.r2)
        .filter(([, v]) => !v)
        .map(([k]) => k);
      if (missing.length) {
        throw new Error(
          'Missing R2 configuration in production: ' + missing.join(', ') + '. ' +
          'Set the R2_* environment variables in your host\'s settings.'
        );
      }
    }
    this.r2Configured = Object.values(this.r2).every(Boolean);
  }

  _loadOrCreateSecret() {
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