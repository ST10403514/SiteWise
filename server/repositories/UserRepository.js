'use strict';

const crypto = require('crypto');
const { getClient } = require('./db');

/**
 * libSQL/Turso-backed user store.
 *
 * Shape returned to callers:
 * { id, name, email, passwordHash, onboarded, profile, acceptedTermsAt, createdAt }
 *
 * acceptedTermsAt is the POPIA proof-of-consent timestamp. It is set during
 * signup (AuthService calls update with it) and preserved across later updates.
 */
class UserRepository {
  constructor(config) {
    this._db = getClient(config);
  }

  _hydrate(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.passwordHash,
      onboarded: !!row.onboarded,
      profile: row.profile ? JSON.parse(row.profile) : null,
      acceptedTermsAt: row.acceptedTermsAt || null,
      createdAt: row.createdAt,
    };
  }

  async findByEmail(email) {
    const rs = await this._db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email],
    });
    return this._hydrate(rs.rows[0]);
  }

  async findById(id) {
    const rs = await this._db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [id],
    });
    return this._hydrate(rs.rows[0]);
  }

  async create({ name, email, passwordHash }) {
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash,
      onboarded: false,
      profile: null,
      acceptedTermsAt: null,
      createdAt: new Date().toISOString(),
    };
    await this._db.execute({
      sql: `INSERT INTO users (id, name, email, passwordHash, onboarded, profile, acceptedTermsAt, createdAt)
            VALUES (:id, :name, :email, :passwordHash, :onboarded, :profile, :acceptedTermsAt, :createdAt)`,
      args: {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        onboarded: 0,
        profile: null,
        acceptedTermsAt: null,
        createdAt: user.createdAt,
      },
    });
    return user;
  }

  async update(id, changes) {
    const current = await this.findById(id);
    if (!current) throw new Error(`User ${id} not found`);

    const merged = { ...current, ...changes };

    await this._db.execute({
      sql: `UPDATE users
            SET name = :name,
                email = :email,
                passwordHash = :passwordHash,
                onboarded = :onboarded,
                profile = :profile,
                acceptedTermsAt = :acceptedTermsAt
            WHERE id = :id`,
      args: {
        id,
        name: merged.name,
        email: merged.email,
        passwordHash: merged.passwordHash,
        onboarded: merged.onboarded ? 1 : 0,
        profile: merged.profile ? JSON.stringify(merged.profile) : null,
        acceptedTermsAt: merged.acceptedTermsAt || null,
      },
    });

    return merged;
  }
}

module.exports = UserRepository;