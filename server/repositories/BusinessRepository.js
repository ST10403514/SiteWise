'use strict';

const crypto = require('crypto');
const { getClient } = require('./db');
const { currentMonthKey } = require('../utils/jobQuota');

/**
 * libSQL/Turso-backed business (tenant) store. A business holds the
 * branding/company profile that used to live directly on a user row -
 * multiple users (team members) can belong to one business.
 */
class BusinessRepository {
  constructor(config) {
    this._db = getClient(config);
  }

  _hydrate(row) {
    if (!row) return null;
    return {
      id: row.id,
      profile: row.profile ? JSON.parse(row.profile) : null,
      // 'free' | 'solo' | 'team' - 'free' and 'solo' currently behave
      // identically (neither is paid-gated to anything yet); only 'team'
      // unlocks anything (inviting others). No self-serve upgrade yet;
      // flipped by hand until billing exists.
      tier: row.tier || 'free',
      jobsCreatedThisMonth: row.jobsCreatedThisMonth || 0,
      jobsCreatedMonthKey: row.jobsCreatedMonthKey || null,
      createdAt: row.createdAt,
    };
  }

  /** @param {{profile?: object|null, tier?: string}} [input] */
  async create({ profile = null, tier = 'free' } = {}) {
    const business = {
      id: crypto.randomUUID(),
      profile,
      tier,
      createdAt: new Date().toISOString(),
    };
    await this._db.execute({
      sql: 'INSERT INTO businesses (id, profile, tier, createdAt) VALUES (:id, :profile, :tier, :createdAt)',
      args: {
        id: business.id,
        profile: profile ? JSON.stringify(profile) : null,
        tier,
        createdAt: business.createdAt,
      },
    });
    return business;
  }

  async findById(id) {
    const rs = await this._db.execute({
      sql: 'SELECT * FROM businesses WHERE id = ?',
      args: [id],
    });
    return this._hydrate(rs.rows[0]);
  }

  /** @param {{profile: object|null}} changes */
  async update(id, { profile }) {
    await this._db.execute({
      sql: 'UPDATE businesses SET profile = :profile WHERE id = :id',
      args: { id, profile: profile ? JSON.stringify(profile) : null },
    });
    return this.findById(id);
  }

  /** No self-serve path yet - called by hand (a script, or direct DB access) until billing exists. */
  async updateTier(id, tier) {
    await this._db.execute({ sql: 'UPDATE businesses SET tier = :tier WHERE id = :id', args: { id, tier } });
    return this.findById(id);
  }

  /**
   * Records one more job created this month, rolling the counter over to a
   * fresh month first if the stored one has passed. Called only on a
   * genuine new job create (JobController.save) - never on an update, and
   * never undone by a delete.
   *
   * A single atomic UPDATE rather than a read-then-write - the CASE does
   * the same rollover check jobQuota() does, in SQL, on the row being
   * written. This also closes a real (if rare) race: two concurrent
   * creates for the same business could previously both read the same
   * starting count and both write count+1, losing one of the increments.
   */
  async incrementMonthlyJobCount(id) {
    const key = currentMonthKey();
    await this._db.execute({
      sql: `UPDATE businesses
            SET jobsCreatedThisMonth = CASE WHEN jobsCreatedMonthKey = :key THEN jobsCreatedThisMonth + 1 ELSE 1 END,
                jobsCreatedMonthKey = :key
            WHERE id = :id`,
      args: { id, key },
    });
  }

  /** Only ever called once a business has no users/jobs left referencing it. */
  async delete(id) {
    await this._db.execute({ sql: 'DELETE FROM businesses WHERE id = ?', args: [id] });
  }
}

module.exports = BusinessRepository;
