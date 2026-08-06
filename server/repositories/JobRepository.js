'use strict';

const { getClient } = require('./db');

/**
 * libSQL/Turso-backed job store, scoped per user.
 *
 * Public method NAMES are unchanged (listByUser, findByIdForUser, upsert,
 * removeForUser), but every method is now ASYNC and returns a Promise.
 * Callers must await.
 *
 * The full job payload (client, photos, line items, totals, etc.) is kept
 * as JSON text in the `data` column, exactly as before.
 */
class JobRepository {
  /** @param {{url: string, authToken?: string}} config libSQL/Turso connection */
  constructor(config) {
    this._db = getClient(config);
  }

  /**
   * Lightweight summaries for the dashboard (no photo payloads).
   * @returns {Promise<object[]>} newest first
   */
  async listByUser(userId) {
    const rs = await this._db.execute({
      sql: 'SELECT id, data, updatedAt FROM jobs WHERE userId = ? ORDER BY updatedAt DESC',
      args: [userId],
    });
    return rs.rows.map((row) => {
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

  /** @returns {Promise<object|null>} full record, only if owned by userId */
  async findByIdForUser(id, userId) {
    const rs = await this._db.execute({
      sql: 'SELECT * FROM jobs WHERE id = ? AND userId = ?',
      args: [id, userId],
    });
    const row = rs.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      data: JSON.parse(row.data),
      updatedAt: row.updatedAt,
    };
  }

  /** Create or replace a job owned by userId. @returns {Promise<object>} */
  async upsert(id, userId, data) {
    const existingRs = await this._db.execute({
      sql: 'SELECT userId FROM jobs WHERE id = ?',
      args: [id],
    });
    const existing = existingRs.rows[0];

    if (existing && existing.userId !== userId) {
      const err = new Error('Job belongs to another user');
      err.code = 'FORBIDDEN';
      throw err;
    }

    const updatedAt = new Date().toISOString();
    const serialized = JSON.stringify(data);

    if (existing) {
      await this._db.execute({
        sql: 'UPDATE jobs SET data = :data, updatedAt = :updatedAt WHERE id = :id',
        args: { id, data: serialized, updatedAt },
      });
    } else {
      await this._db.execute({
        sql: 'INSERT INTO jobs (id, userId, data, updatedAt) VALUES (:id, :userId, :data, :updatedAt)',
        args: { id, userId, data: serialized, updatedAt },
      });
    }

    return { id, userId, data, updatedAt };
  }

  /** @returns {Promise<boolean>} true if a job was removed */
  async removeForUser(id, userId) {
    const rs = await this._db.execute({
      sql: 'DELETE FROM jobs WHERE id = ? AND userId = ?',
      args: [id, userId],
    });
    return rs.rowsAffected > 0;
  }
}

module.exports = JobRepository;