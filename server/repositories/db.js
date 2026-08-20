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
// businessId/isOwner (users) and businessId (jobs) support team accounts - see
// the "businesses" and "invites" tables below. A user's login is a person; a
// business is the tenant itself (profile/branding/banking), which multiple
// users can belong to. Not relied on for fresh-install correctness alone -
// existing rows need the backfill script (server/scripts/backfill-businesses.js).
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
    businessId     TEXT,
    isOwner        INTEGER NOT NULL DEFAULT 0,
    createdAt      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS businesses (
    id        TEXT PRIMARY KEY,
    profile   TEXT,
    tier      TEXT NOT NULL DEFAULT 'free',
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id         TEXT PRIMARY KEY,
    userId     TEXT NOT NULL,
    businessId TEXT,
    data       TEXT NOT NULL,
    updatedAt  TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS invites (
    id              TEXT PRIMARY KEY,
    businessId      TEXT NOT NULL,
    email           TEXT NOT NULL,
    invitedByUserId TEXT NOT NULL,
    tokenHash       TEXT NOT NULL UNIQUE,
    expiresAt       TEXT NOT NULL,
    acceptedAt      TEXT,
    createdAt       TEXT NOT NULL,
    FOREIGN KEY (businessId) REFERENCES businesses(id),
    FOREIGN KEY (invitedByUserId) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(userId);
  CREATE INDEX IF NOT EXISTS idx_invites_business ON invites(businessId);
  CREATE INDEX IF NOT EXISTS idx_invites_tokenHash ON invites(tokenHash);
`;
// idx_jobs_business is NOT in SCHEMA above, deliberately - it indexes a
// column (jobs.businessId) that only exists on a fresh install via the
// CREATE TABLE block. On an already-running database, that CREATE TABLE is
// a no-op (the table already exists without the column), so an index on it
// here would fail before the MIGRATIONS loop below ever adds the column.
// invites/businesses don't have this problem - they're wholly new tables,
// so their CREATE TABLE always runs in full, columns and all, either way.

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
  // Team accounts: businessId is nullable here on purpose (no meaningful
  // constant default for a UUID) - every pre-existing row gets a real one
  // via the one-off server/scripts/backfill-businesses.js script, not via
  // this migration. isOwner defaults to 0 for existing rows; the backfill
  // script explicitly flips it to 1 for each one (they're the sole owner of
  // their own newly-created business).
  { name: 'users.businessId', sql: 'ALTER TABLE users ADD COLUMN businessId TEXT' },
  { name: 'users.isOwner', sql: 'ALTER TABLE users ADD COLUMN isOwner INTEGER NOT NULL DEFAULT 0' },
  { name: 'jobs.businessId', sql: 'ALTER TABLE jobs ADD COLUMN businessId TEXT' },
  // Must run after the migration above, not in SCHEMA - see the comment by
  // idx_jobs_business's absence there for why.
  { name: 'idx_jobs_business', sql: 'CREATE INDEX IF NOT EXISTS idx_jobs_business ON jobs(businessId)' },
  // NOTE: this shipped with the wrong default - 'solo' is a PAID tier, new
  // signups haven't paid anything and should default to 'free'. Per the
  // never-edit-a-shipped-migration rule, the SQL below is left as originally
  // shipped (editing it wouldn't retroactively change SQLite's stored
  // column default anyway); every pre-existing business this ALTER TABLE
  // touched was corrected to 'free' by hand afterwards (except accounts
  // deliberately upgraded for testing). The application-level default
  // ({@link BusinessRepository.create}) is already correct ('free') for
  // every business created from here on.
  { name: 'businesses.tier', sql: "ALTER TABLE businesses ADD COLUMN tier TEXT NOT NULL DEFAULT 'solo'" },
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