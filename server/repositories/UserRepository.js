'use strict';

const crypto = require('crypto');
const { getClient } = require('./db');

/**
 * libSQL/Turso-backed user store.
 *
 * Public method NAMES are unchanged (findByEmail, findById, create, update),
 * but every method is now ASYNC and returns a Promise. Callers must await.
 *
 * The `profile` field is stored as JSON text and transparently parsed back
 * into an object on the way out, so callers still see the same shape:
 * { id, name, email, passwordHash, onboarded, profile, createdAt }.
 */
class UserRepository {
  /** @param {{url: string, authToken?: string}} config libSQL/Turso connection */
  constructor(config) {
    this._db = getClient(config);
  }

  /** Convert a DB row into the object shape the app expects. */
  _hydrate(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.passwordHash,
      onboarded: !!row.onboarded,
      profile: row.profile ? JSON.parse(row.profile) : null,
      createdAt: row.createdAt,
    };
  }

  /** @returns {Promise<object|null>} */
  async findByEmail(email) {
    const rs = await this._db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email],
    });
    return this._hydrate(rs.rows[0]);
  }

  /** @returns {Promise<object|null>} */
  async findById(id) {
    const rs = await this._db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [id],
    });
    return this._hydrate(rs.rows[0]);
  }

  /**
   * @param {{name: string, email: string, passwordHash: string}} data
   * @returns {Promise<object>} the created user record
   */
  async create({ name, email, passwordHash }) {
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash,
      onboarded: false,
      profile: null,
      createdAt: new Date().toISOString(),
    };
    await this._db.execute({
      sql: `INSERT INTO users (id, name, email, passwordHash, onboarded, profile, createdAt)
            VALUES (:id, :name, :email, :passwordHash, :onboarded, :profile, :createdAt)`,
      args: {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        onboarded: 0,
        profile: null,
        createdAt: user.createdAt,
      },
    });
    return user;
  }

  /**
   * Shallow-merge changes into an existing user.
   * Mirrors the old Object.assign semantics: only provided keys change.
   * @returns {Promise<object>} the updated user record
   */
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
                profile = :profile
            WHERE id = :id`,
      args: {
        id,
        name: merged.name,
        email: merged.email,
        passwordHash: merged.passwordHash,
        onboarded: merged.onboarded ? 1 : 0,
        profile: merged.profile ? JSON.stringify(merged.profile) : null,
      },
    });

    return merged;
  }
}

module.exports = UserRepository;