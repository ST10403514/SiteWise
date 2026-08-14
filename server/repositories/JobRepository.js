'use strict';

const { getClient } = require('./db');

/**
 * libSQL/Turso-backed job store, scoped per user.
 *
 * Public method NAMES are unchanged (listByUser, findByIdForUser, upsert,
 * removeForUser), and every method is async (returns a Promise).
 *
 * The full job payload (client, photos, line items, totals, etc.) is kept
 * as JSON text in the `data` column.
 *
 * PERFORMANCE NOTE: photos are stored as base64 inside `data`, so a single
 * job row can be hundreds of KB. listByUser therefore extracts only the
 * small summary fields server-side with json_extract, so the dashboard never
 * pulls the heavy photo payloads across the network. Selecting the whole
 * `data` blob here would ship every job's photos on every dashboard load.
 */
class JobRepository {
  /** @param {{url: string, authToken?: string}} config libSQL/Turso connection */
  constructor(config) {
    this._db = getClient(config);
  }

  /**
   * Lightweight summaries for the dashboard (no photo payloads).
   * The summary fields are pulled out of the JSON server-side, so only a
   * few hundred bytes per job cross the wire instead of the full blob.
   * @returns {Promise<object[]>} newest first
   */
  async listByUser(userId) {
    const rs = await this._db.execute({
      sql: `SELECT id,
                   json_extract(data, '$.quoteNumber')  AS quoteNumber,
                   json_extract(data, '$.clientName')   AS clientName,
                   json_extract(data, '$.siteAddress')  AS siteAddress,
                   json_extract(data, '$.outcome')      AS outcome,
                   json_extract(data, '$.grandTotal')   AS grandTotal,
                   json_extract(data, '$.jobType')      AS jobType,
                   json_extract(data, '$.project.status') AS projectStatus,
                   json_extract(data, '$.project.value')  AS projectValue,
                   COALESCE(json_array_length(data, '$.photos'), 0) AS photoCount,
                   updatedAt
            FROM jobs
            WHERE userId = ?
            ORDER BY updatedAt DESC`,
      args: [userId],
    });
    // Rows already have the exact summary shape the dashboard expects.
    return rs.rows.map((row) => ({
      id: row.id,
      quoteNumber: row.quoteNumber,
      clientName: row.clientName,
      siteAddress: row.siteAddress,
      outcome: row.outcome,
      grandTotal: row.grandTotal,
      jobType: row.jobType,
      projectStatus: row.projectStatus,
      projectValue: row.projectValue,
      photoCount: row.photoCount,
      updatedAt: row.updatedAt,
    }));
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

  /**
   * Full data for every job owned by userId. Only used ahead of account
   * deletion, to find every R2 photo/receipt to clean up before the
   * cascade delete removes the rows themselves.
   * @returns {Promise<object[]>}
   */
  async listFullDataForUser(userId) {
    const rs = await this._db.execute({
      sql: 'SELECT data FROM jobs WHERE userId = ?',
      args: [userId],
    });
    return rs.rows.map((row) => JSON.parse(row.data));
  }
}

module.exports = JobRepository;