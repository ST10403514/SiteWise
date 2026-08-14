'use strict';

const crypto = require('crypto');
const { getClient } = require('./db');

/**
 * libSQL/Turso-backed user store.
 *
 * Shape returned to callers:
 * { id, name, email, passwordHash, onboarded, profile, acceptedTermsAt,
 *   resetTokenHash, resetTokenExpires, createdAt }
 *
 * resetTokenHash / resetTokenExpires support password reset. We store only a
 * SHA-256 HASH of the reset token (never the raw token) plus an expiry (ms
 * since epoch as text). findByResetTokenHash looks a user up by that hash.
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
      resetTokenHash: row.resetTokenHash || null,
      resetTokenExpires: row.resetTokenExpires ? Number(row.resetTokenExpires) : null,
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

  /** Look a user up by the stored SHA-256 hash of their reset token. */
  async findByResetTokenHash(resetTokenHash) {
    const rs = await this._db.execute({
      sql: 'SELECT * FROM users WHERE resetTokenHash = ?',
      args: [resetTokenHash],
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
      resetTokenHash: null,
      resetTokenExpires: null,
      createdAt: new Date().toISOString(),
    };
    await this._db.execute({
      sql: `INSERT INTO users
              (id, name, email, passwordHash, onboarded, profile, acceptedTermsAt,
               resetTokenHash, resetTokenExpires, createdAt)
            VALUES
              (:id, :name, :email, :passwordHash, :onboarded, :profile, :acceptedTermsAt,
               :resetTokenHash, :resetTokenExpires, :createdAt)`,
      args: {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        onboarded: 0,
        profile: null,
        acceptedTermsAt: null,
        resetTokenHash: null,
        resetTokenExpires: null,
        createdAt: user.createdAt,
      },
    });
    return user;
  }

  /**
   * Deletes the user row outright. `jobs.userId` has ON DELETE CASCADE
   * (see db.js), so every job the user owns is removed with it - callers
   * must clean up any R2 photos those jobs reference BEFORE calling this,
   * since the cascade only touches Turso, not R2.
   * @returns {Promise<boolean>} true if a user was removed
   */
  async delete(id) {
    const rs = await this._db.execute({
      sql: 'DELETE FROM users WHERE id = ?',
      args: [id],
    });
    return rs.rowsAffected > 0;
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
                acceptedTermsAt = :acceptedTermsAt,
                resetTokenHash = :resetTokenHash,
                resetTokenExpires = :resetTokenExpires
            WHERE id = :id`,
      args: {
        id,
        name: merged.name,
        email: merged.email,
        passwordHash: merged.passwordHash,
        onboarded: merged.onboarded ? 1 : 0,
        profile: merged.profile ? JSON.stringify(merged.profile) : null,
        acceptedTermsAt: merged.acceptedTermsAt || null,
        resetTokenHash: merged.resetTokenHash || null,
        resetTokenExpires: merged.resetTokenExpires != null ? String(merged.resetTokenExpires) : null,
      },
    });

    return merged;
  }
}

module.exports = UserRepository;