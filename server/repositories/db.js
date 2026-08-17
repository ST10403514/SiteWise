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

async function initSchema(config) {
  const client = getClient(config);
  await client.executeMultiple(SCHEMA);
  // CREATE TABLE IF NOT EXISTS doesn't retroactively add columns to a table
  // that already existed before this one was added - needed for any
  // pre-existing production database. Harmless no-op on a fresh one, since
  // the column above already exists there and this just fails quietly.
  try {
    await client.execute('ALTER TABLE users ADD COLUMN passwordChangedAt TEXT');
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) throw err;
  }
  return client;
}

module.exports = { getClient, initSchema };