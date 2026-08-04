'use strict';

/**
 * One-time migration: reads the existing users.json and jobs.json and loads
 * them into the SQLite database. Safe to run more than once - it uses
 * INSERT OR IGNORE so already-migrated rows are skipped.
 *
 * Usage:
 *   node server/scripts/migrate-json-to-sqlite.js
 *
 * It reads paths from config.js so it always targets the same files/db the
 * app uses.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getDb } = require('../repositories/db');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function main() {
  const db = getDb(config.dbFile);

  const users = readJson(config.usersFile);
  const jobs = readJson(config.jobsFile);

  console.log(`Found ${users.length} user(s) and ${jobs.length} job(s) in JSON.`);

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, passwordHash, onboarded, profile, createdAt)
    VALUES (@id, @name, @email, @passwordHash, @onboarded, @profile, @createdAt)
  `);
  const insertJob = db.prepare(`
    INSERT OR IGNORE INTO jobs (id, userId, data, updatedAt)
    VALUES (@id, @userId, @data, @updatedAt)
  `);

  let uCount = 0;
  let jCount = 0;

  const migrateUsers = db.transaction((rows) => {
    for (const u of rows) {
      const info = insertUser.run({
        id: u.id,
        name: u.name,
        email: u.email,
        passwordHash: u.passwordHash,
        onboarded: u.onboarded ? 1 : 0,
        profile: u.profile ? JSON.stringify(u.profile) : null,
        createdAt: u.createdAt || new Date().toISOString(),
      });
      uCount += info.changes;
    }
  });

  const migrateJobs = db.transaction((rows) => {
    for (const j of rows) {
      // job records are { id, userId, data, updatedAt }
      const info = insertJob.run({
        id: j.id,
        userId: j.userId,
        data: JSON.stringify(j.data),
        updatedAt: j.updatedAt || new Date().toISOString(),
      });
      jCount += info.changes;
    }
  });

  migrateUsers(users);
  migrateJobs(jobs);

  console.log(`Migrated ${uCount} new user(s) and ${jCount} new job(s) into SQLite at:`);
  console.log(`  ${config.dbFile}`);
  console.log('Done. Your JSON files were left untouched (as a backup).');
}

main();
