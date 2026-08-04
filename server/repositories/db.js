'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

/**
 * Opens (and if needed creates) the SQLite database, ensures the schema
 * exists, and returns a shared connection. A single connection is reused
 * across repositories, which is the recommended pattern for better-sqlite3.
 *
 * The schema keeps the same data shape the JSON stores used:
 *   - users: the queryable fields as columns, `profile` kept as JSON text
 *   - jobs:  ids/owner/timestamp as columns, the whole `data` blob as JSON text
 * This gives real persistence and integrity without flattening the nested
 * job/profile objects the rest of the app already relies on.
 */
let _db = null;

function getDb(dbFile) {
  if (_db) return _db;

  fs.mkdirSync(path.dirname(dbFile), { recursive: true });

  const db = new Database(dbFile);
  // Pragmas: WAL for better concurrency/durability, foreign keys on.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
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
  `);

  _db = db;
  return _db;
}

module.exports = { getDb };