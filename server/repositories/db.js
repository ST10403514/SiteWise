'use strict';

const { createClient } = require('@libsql/client');

let _client = null;

function getClient(config) {
  if (_client) return _client;
  if (!config || !config.url) {
    throw new Error('getClient: a { url } config is required on first call');
  }
  _client = createClient({ url: config.url, authToken: config.authToken });
  return _client;
}

// acceptedTermsAt records WHEN a user accepted the Terms (POPIA proof of consent).
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    email          TEXT NOT NULL UNIQUE,
    passwordHash   TEXT NOT NULL,
    onboarded      INTEGER NOT NULL DEFAULT 0,
    profile        TEXT,
    acceptedTermsAt TEXT,
    passwordChangedAt TEXT,
    resetTokenHash    TEXT,
    resetTokenExpires TEXT,
    createdAt      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id        TEXT PRIMARY KEY,
    userId    TEXT NOT NULL,
    data      TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(userId);
`;

/**
 * Retroactive column additions - CREATE TABLE IF NOT EXISTS above only
 * covers a *fresh* database; it doesn't add a column to a table that
 * already existed before that column was added, which any already-running
 * production database is. Each entry here patches that gap.
 *
 * Convention for adding a new column to an existing table:
 *   1. Add it to the CREATE TABLE block above (so fresh installs get it
 *      for free, and it's documented in one place as the current schema).
 *   2. Add a matching entry here (so the already-running production
 *      database picks it up on next deploy, instead of erroring forever).
 * Never edit or remove a past entry once it's shipped - old databases may
 * still need to run it. Each one is idempotent (safe to re-run against a
 * database that already has the column), since every entry here runs on
 * every startup, forever.
 */
const MIGRATIONS = [
  { name: 'users.passwordChangedAt', sql: 'ALTER TABLE users ADD COLUMN passwordChangedAt TEXT' },
  // These two were added to production by hand at some point, before this
  // migration list existed - added here now so a genuinely fresh database
  // (a new environment, a from-scratch restore) doesn't 500 on first signup
  // the way one did in testing. Harmless no-ops against the live database,
  // which already has them.
  { name: 'users.resetTokenHash', sql: 'ALTER TABLE users ADD COLUMN resetTokenHash TEXT' },
  { name: 'users.resetTokenExpires', sql: 'ALTER TABLE users ADD COLUMN resetTokenExpires TEXT' },
];

async function initSchema(config) {
  const client = getClient(config);
  await client.executeMultiple(SCHEMA);
  for (const migration of MIGRATIONS) {
    try {
      await client.execute(migration.sql);
    } catch (err) {
      if (!/duplicate column/i.test(err.message)) {
        throw new Error(`Migration "${migration.name}" failed: ${err.message}`);
      }
    }
  }
  return client;
}

module.exports = { getClient, initSchema };