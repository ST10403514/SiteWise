'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Central application configuration.
 *
 * Environments:
 *   - Local dev: local libSQL file, auto-generated JWT secret, localhost URLs.
 *   - Production (Render): Turso, JWT_SECRET from env, R2 for photos, Resend
 *     for email, APP_BASE_URL for building absolute links (e.g. reset emails).
 */
class Config {
  constructor() {
    this.port = Number(process.env.PORT) || 3000;
    this.dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');

    this.usersFile = path.join(this.dataDir, 'users.json'); // legacy
    this.jobsFile = path.join(this.dataDir, 'jobs.json');   // legacy
    this.dbFile = path.join(this.dataDir, 'sitewise.db');

    this.publicDir = path.join(__dirname, '..', 'public');
    this.cookieName = 'ssp_session';
    this.tokenTtl = '7d';
    this.cookieMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
    this.isProduction = process.env.NODE_ENV === 'production';
    this.jwtSecret = process.env.JWT_SECRET || this._loadOrCreateSecret();

    // Absolute base URL of the app, used to build links in emails. MUST be set
    // in production to your live URL, or reset links will point at localhost.
    this.appBaseUrl = (process.env.APP_BASE_URL || `http://localhost:${this.port}`).replace(/\/+$/, '');

    // ── Database (libSQL / Turso) ─────────────────────────────────────────
    if (this.isProduction && !process.env.TURSO_URL) {
      throw new Error('TURSO_URL is required in production.');
    }
    this.db = {
      url: process.env.TURSO_URL || `file:${this.dbFile}`,
      authToken: process.env.TURSO_AUTH_TOKEN,
    };
    if (this.db.url.startsWith('file:')) fs.mkdirSync(this.dataDir, { recursive: true });

    // ── Photo storage (Cloudflare R2) ─────────────────────────────────────
    this.r2 = {
      accountId: process.env.R2_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucket: process.env.R2_BUCKET,
      publicUrl: process.env.R2_PUBLIC_URL,
    };
    if (this.isProduction) {
      const missing = Object.entries(this.r2).filter(([, v]) => !v).map(([k]) => k);
      if (missing.length) {
        throw new Error('Missing R2 configuration in production: ' + missing.join(', '));
      }
    }
    this.r2Configured = Object.values(this.r2).every(Boolean);

    // ── Email (Resend) ────────────────────────────────────────────────────
    // Not hard-required: if unset, password-reset requests still succeed but no
    // email is sent (the app logs a warning). Set RESEND_API_KEY to enable.
    this.resend = {
      apiKey: process.env.RESEND_API_KEY || null,
      // Test sender works out of the box; swap to your verified domain later.
      from: process.env.EMAIL_FROM || 'SiteWise <onboarding@resend.dev>',
    };
    this.emailConfigured = !!this.resend.apiKey;
  }

  _loadOrCreateSecret() {
    if (this.isProduction) throw new Error('JWT_SECRET is required in production.');
    const secretFile = path.join(this.dataDir, '.jwt-secret');
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
    return secret;
  }
}

module.exports = new Config();