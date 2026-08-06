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
  return client;
}

module.exports = { getClient, initSchema };