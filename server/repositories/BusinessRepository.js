'use strict';

const crypto = require('crypto');
const { getClient } = require('./db');

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
      createdAt: row.createdAt,
    };
  }

  /** @param {{profile?: object|null}} [input] */
  async create({ profile = null } = {}) {
    const business = {
      id: crypto.randomUUID(),
      profile,
      createdAt: new Date().toISOString(),
    };
    await this._db.execute({
      sql: 'INSERT INTO businesses (id, profile, createdAt) VALUES (:id, :profile, :createdAt)',
      args: {
        id: business.id,
        profile: profile ? JSON.stringify(profile) : null,
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

  /** Only ever called once a business has no users/jobs left referencing it. */
  async delete(id) {
    await this._db.execute({ sql: 'DELETE FROM businesses WHERE id = ?', args: [id] });
  }
}

module.exports = BusinessRepository;
