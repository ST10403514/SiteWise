'use strict';

const { getDb } = require('./db');

/**
 * SQLite-backed job store, scoped per user.
 *
 * Public interface is unchanged from the previous JSON implementation:
 * listByUser, findByIdForUser, upsert, removeForUser. Controllers untouched.
 *
 * The full job payload (client, photos, line items, totals, etc.) is kept
 * as JSON text in the `data` column, exactly as it was in the JSON store.
 */
class JobRepository {
  /** @param {string} dbFile Absolute path of the SQLite database file */
  constructor(dbFile) {
    this._db = getDb(dbFile);

    this._byUser = this._db.prepare(
      'SELECT id, data, updatedAt FROM jobs WHERE userId = ? ORDER BY updatedAt DESC'
    );
    this._byIdOwned = this._db.prepare(
      'SELECT * FROM jobs WHERE id = ? AND userId = ?'
    );
    this._byId = this._db.prepare('SELECT * FROM jobs WHERE id = ?');
    this._insert = this._db.prepare(
      'INSERT INTO jobs (id, userId, data, updatedAt) VALUES (@id, @userId, @data, @updatedAt)'
    );
    this._updateData = this._db.prepare(
      'UPDATE jobs SET data = @data, updatedAt = @updatedAt WHERE id = @id'
    );
    this._delete = this._db.prepare(
      'DELETE FROM jobs WHERE id = ? AND userId = ?'
    );
  }

  /**
   * Lightweight summaries for the dashboard (no photo payloads).
   * @returns {object[]} newest first
   */
  listByUser(userId) {
    const rows = this._byUser.all(userId);
    return rows.map((row) => {
      const data = JSON.parse(row.data);
      return {
        id: row.id,
        quoteNumber: data.quoteNumber,
        clientName: data.clientName,
        siteAddress: data.siteAddress,
        outcome: data.outcome,
        grandTotal: data.grandTotal,
        photoCount: Array.isArray(data.photos) ? data.photos.length : 0,
        updatedAt: row.updatedAt,
      };
    });
  }

  /** @returns {object|null} full record, only if owned by userId */
  findByIdForUser(id, userId) {
    const row = this._byIdOwned.get(id, userId);
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      data: JSON.parse(row.data),
      updatedAt: row.updatedAt,
    };
  }

  /** Create or replace a job owned by userId. @returns {object} */
  upsert(id, userId, data) {
    const existing = this._byId.get(id);
    if (existing && existing.userId !== userId) {
      const err = new Error('Job belongs to another user');
      err.code = 'FORBIDDEN';
      throw err;
    }

    const updatedAt = new Date().toISOString();
    const serialized = JSON.stringify(data);

    if (existing) {
      this._updateData.run({ id, data: serialized, updatedAt });
    } else {
      this._insert.run({ id, userId, data: serialized, updatedAt });
    }

    return { id, userId, data, updatedAt };
  }

  /** @returns {boolean} true if a job was removed */
  removeForUser(id, userId) {
    const info = this._delete.run(id, userId);
    return info.changes > 0;
  }
}

module.exports = JobRepository;