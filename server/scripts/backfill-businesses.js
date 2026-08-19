'use strict';

/**
 * One-off backfill for team accounts: every user row that predates the
 * businesses/isOwner/businessId columns needs a business created FOR it
 * retroactively (one business per existing user, marked as its owner - the
 * only meaning-preserving transform, since every existing login already
 * behaves like a one-person business), and its jobs re-scoped to point at
 * that new business instead of just its creator.
 *
 * Idempotent and resumable by construction: every step is `WHERE ... IS
 * NULL`-guarded, so re-running after a partial failure only touches rows
 * that weren't already done - it never double-creates a business for an
 * already-migrated user. Never touches jobs.data or deletes anything.
 *
 * Usage:
 *   node server/scripts/backfill-businesses.js              # runs for real
 *   node server/scripts/backfill-businesses.js --dry-run    # logs only, writes nothing
 *
 * Targets whatever TURSO_URL/DATA_DIR the environment resolves to - point
 * the environment at a throwaway/restored copy first, verify the output,
 * THEN run for real against production. See the team-accounts plan for the
 * full safety procedure.
 */
require('dotenv').config();
const crypto = require('crypto');
const config = require('../config');
const { getClient, initSchema } = require('../repositories/db');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  await initSchema(config.db);
  const client = getClient(config.db);

  console.log(`Target: ${config.db.url}${DRY_RUN ? ' (--dry-run, no writes)' : ''}`);

  const usersRs = await client.execute(
    'SELECT id, email, profile, createdAt FROM users WHERE businessId IS NULL ORDER BY createdAt ASC',
  );
  const users = usersRs.rows;
  console.log(`Found ${users.length} user(s) needing a business.`);

  let jobsTotal = 0;

  for (const user of users) {
    const businessId = crypto.randomUUID();
    const jobsRs = await client.execute({
      sql: 'SELECT COUNT(*) as n FROM jobs WHERE userId = ? AND businessId IS NULL',
      args: [user.id],
    });
    const jobCount = Number(jobsRs.rows[0].n);

    if (DRY_RUN) {
      console.log(`[dry-run] ${user.email} -> new business ${businessId}, ${jobCount} job(s) to re-scope`);
      jobsTotal += jobCount;
      continue;
    }

    await client.execute({
      sql: 'INSERT INTO businesses (id, profile, createdAt) VALUES (:id, :profile, :createdAt)',
      args: { id: businessId, profile: user.profile || null, createdAt: user.createdAt },
    });
    await client.execute({
      sql: 'UPDATE users SET businessId = :businessId, isOwner = 1 WHERE id = :id',
      args: { businessId, id: user.id },
    });
    await client.execute({
      sql: 'UPDATE jobs SET businessId = :businessId WHERE userId = :userId AND businessId IS NULL',
      args: { businessId, userId: user.id },
    });

    console.log(`migrated ${user.email} -> business ${businessId}, ${jobCount} job(s) re-scoped`);
    jobsTotal += jobCount;
  }

  console.log(`\n${DRY_RUN ? 'Would migrate' : 'Migrated'} ${users.length} user(s), ${jobsTotal} job(s) total.`);

  if (DRY_RUN) {
    console.log('Dry run only - nothing was written. Re-run without --dry-run to apply.');
    return;
  }

  const remainingUsers = await client.execute('SELECT COUNT(*) as n FROM users WHERE businessId IS NULL');
  const remainingJobs = await client.execute('SELECT COUNT(*) as n FROM jobs WHERE businessId IS NULL');
  const nUsers = Number(remainingUsers.rows[0].n);
  const nJobs = Number(remainingJobs.rows[0].n);
  console.log(`Sanity check: ${nUsers} user(s) / ${nJobs} job(s) still missing a businessId.`);
  if (nUsers !== 0 || nJobs !== 0) {
    console.error('FAILED sanity check - re-run this script to pick up whatever was missed.');
    process.exitCode = 1;
  } else {
    console.log('Clean. Every row has a businessId.');
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exitCode = 1;
});
