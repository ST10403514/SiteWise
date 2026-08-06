'use strict';

const { createClient } = require('@libsql/client');

/**
 * Opens a shared libSQL client (Turso in production, a local file in dev)
 * and, once, ensures the schema exists.
 *
 * IMPORTANT: unlike the old better-sqlite3 setup, every repository method is
 * now ASYNC and returns a Promise. The client itself is created synchronously,
 * but schema creation is async and must be awaited once at startup via
 * initSchema() before any repository is used.
 *
 * Config:
 *   - url:       'libsql://your-db.turso.io' (Turso) OR 'file:./data/sitewise.db' (local dev)
 *   - authToken: Turso auth token. Omit for a local file: URL.
 */
let _client = null;

function getClient(config) {
  if (_client) return _client;
  if (!config || !config.url) {
    throw new Error('getClient: a { url } config is required on first call');
  }
  _client = createClient({
    url: config.url,
    authToken: config.authToken, // undefined is fine for local file: URLs
  });
  return _client;
}

// Same shape the JSON stores and the better-sqlite3 version used.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    onboarded    INTEGER NOT NULL DEFAULT 0,
    profile      TEXT,
    createdAt    TEXT NOT NULL
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
 * Create tables/indexes if they do not exist. Call once at server startup,
 * before the repositories handle any request. executeMultiple runs the
 * whole script the way the old db.exec() did.
 */
async function initSchema(config) {
  const client = getClient(config);
  await client.executeMultiple(SCHEMA);
  return client;
}

module.exports = { getClient, initSchema };