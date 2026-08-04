'use strict';

const crypto = require('crypto');
const { getDb } = require('./db');

/**
 * SQLite-backed user store.
 *
 * Public interface is unchanged from the previous JSON implementation, so
 * the service layer needs no edits: findByEmail, findById, create, update.
 *
 * The `profile` field is stored as JSON text and transparently parsed back
 * into an object on the way out, so callers still see the same shape they
 * always did ({ id, name, email, passwordHash, onboarded, profile, createdAt }).
 */
class UserRepository {
  /** @param {string} dbFile Absolute path of the SQLite database file */
  constructor(dbFile) {
    this._db = getDb(dbFile);

    this._insert = this._db.prepare(`
      INSERT INTO users (id, name, email, passwordHash, onboarded, profile, createdAt)
      VALUES (@id, @name, @email, @passwordHash, @onboarded, @profile, @createdAt)
    `);
    this._byEmail = this._db.prepare('SELECT * FROM users WHERE email = ?');
    this._byId = this._db.prepare('SELECT * FROM users WHERE id = ?');
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

  /** @returns {object|null} */
  findByEmail(email) {
    return this._hydrate(this._byEmail.get(email));
  }

  /** @returns {object|null} */
  findById(id) {
    return this._hydrate(this._byId.get(id));
  }

  /**
   * @param {{name: string, email: string, passwordHash: string}} data
   * @returns {object} the created user record
   */
  create({ name, email, passwordHash }) {
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash,
      onboarded: false,
      profile: null,
      createdAt: new Date().toISOString(),
    };
    this._insert.run({
      id: user.id,
      name: user.name,
      email: user.email,
      passwordHash: user.passwordHash,
      onboarded: 0,
      profile: null,
      createdAt: user.createdAt,
    });
    return user;
  }

  /**
   * Shallow-merge changes into an existing user.
   * Mirrors the old Object.assign semantics: only provided keys change.
   * @returns {object} the updated user record
   */
  update(id, changes) {
    const current = this.findById(id);
    if (!current) throw new Error(`User ${id} not found`);

    const merged = { ...current, ...changes };

    this._db.prepare(`
      UPDATE users
      SET name = @name,
          email = @email,
          passwordHash = @passwordHash,
          onboarded = @onboarded,
          profile = @profile
      WHERE id = @id
    `).run({
      id,
      name: merged.name,
      email: merged.email,
      passwordHash: merged.passwordHash,
      onboarded: merged.onboarded ? 1 : 0,
      profile: merged.profile ? JSON.stringify(merged.profile) : null,
    });

    return merged;
  }
}

module.exports = UserRepository;