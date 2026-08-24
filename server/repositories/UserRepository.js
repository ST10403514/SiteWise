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
      passwordChangedAt: row.passwordChangedAt || null,
      resetTokenHash: row.resetTokenHash || null,
      resetTokenExpires: row.resetTokenExpires ? Number(row.resetTokenExpires) : null,
      businessId: row.businessId || null,
      isOwner: !!row.isOwner,
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

  /**
   * findById(userId) + BusinessRepository.findById(user.businessId) in one
   * round trip via LEFT JOIN, instead of two sequential ones - built for
   * requireAuth, which needs both on every single authenticated request
   * and was the biggest source of avoidable per-request DB latency in the
   * app. Business columns are aliased (b_*) to avoid colliding with the
   * user columns of the same name (id, profile, createdAt).
   * @returns {Promise<{ user: object|null, business: object|null }>}
   */
  async findByIdWithBusiness(id) {
    const rs = await this._db.execute({
      sql: `SELECT
              u.id, u.name, u.email, u.passwordHash, u.onboarded, u.profile,
              u.acceptedTermsAt, u.passwordChangedAt, u.resetTokenHash, u.resetTokenExpires,
              u.businessId, u.isOwner, u.createdAt,
              b.id AS b_id, b.profile AS b_profile, b.tier AS b_tier,
              b.jobsCreatedThisMonth AS b_jobsCreatedThisMonth,
              b.jobsCreatedMonthKey AS b_jobsCreatedMonthKey,
              b.paystackCustomerCode AS b_paystackCustomerCode,
              b.subscriptionCode AS b_subscriptionCode,
              b.subscriptionStatus AS b_subscriptionStatus,
              b.subscriptionRenewsAt AS b_subscriptionRenewsAt,
              b.createdAt AS b_createdAt
            FROM users u
            LEFT JOIN businesses b ON u.businessId = b.id
            WHERE u.id = ?`,
      args: [id],
    });
    const row = rs.rows[0];
    if (!row) return { user: null, business: null };
    const user = this._hydrate(row);
    // Mirrors BusinessRepository._hydrate - kept in sync by hand, same as
    // every other repository in this codebase (no shared base class).
    const business = row.b_id ? {
      id: row.b_id,
      profile: row.b_profile ? JSON.parse(row.b_profile) : null,
      tier: row.b_tier || 'free',
      jobsCreatedThisMonth: row.b_jobsCreatedThisMonth || 0,
      jobsCreatedMonthKey: row.b_jobsCreatedMonthKey || null,
      paystackCustomerCode: row.b_paystackCustomerCode || null,
      subscriptionCode: row.b_subscriptionCode || null,
      subscriptionStatus: row.b_subscriptionStatus || null,
      subscriptionRenewsAt: row.b_subscriptionRenewsAt || null,
      createdAt: row.b_createdAt,
    } : null;
    return { user, business };
  }

  /** Look a user up by the stored SHA-256 hash of their reset token. */
  async findByResetTokenHash(resetTokenHash) {
    const rs = await this._db.execute({
      sql: 'SELECT * FROM users WHERE resetTokenHash = ?',
      args: [resetTokenHash],
    });
    return this._hydrate(rs.rows[0]);
  }

  /** @param {{name, email, passwordHash, businessId: string, isOwner?: boolean}} input */
  async create({ name, email, passwordHash, businessId, isOwner = false }) {
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash,
      onboarded: false,
      profile: null,
      acceptedTermsAt: null,
      passwordChangedAt: null,
      resetTokenHash: null,
      resetTokenExpires: null,
      businessId,
      isOwner,
      createdAt: new Date().toISOString(),
    };
    await this._db.execute({
      sql: `INSERT INTO users
              (id, name, email, passwordHash, onboarded, profile, acceptedTermsAt,
               passwordChangedAt, resetTokenHash, resetTokenExpires, businessId, isOwner, createdAt)
            VALUES
              (:id, :name, :email, :passwordHash, :onboarded, :profile, :acceptedTermsAt,
               :passwordChangedAt, :resetTokenHash, :resetTokenExpires, :businessId, :isOwner, :createdAt)`,
      args: {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        onboarded: 0,
        profile: null,
        acceptedTermsAt: null,
        passwordChangedAt: null,
        resetTokenHash: null,
        resetTokenExpires: null,
        businessId,
        isOwner: isOwner ? 1 : 0,
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
                passwordChangedAt = :passwordChangedAt,
                resetTokenHash = :resetTokenHash,
                resetTokenExpires = :resetTokenExpires,
                businessId = :businessId,
                isOwner = :isOwner
            WHERE id = :id`,
      args: {
        id,
        name: merged.name,
        email: merged.email,
        passwordHash: merged.passwordHash,
        onboarded: merged.onboarded ? 1 : 0,
        profile: merged.profile ? JSON.stringify(merged.profile) : null,
        acceptedTermsAt: merged.acceptedTermsAt || null,
        passwordChangedAt: merged.passwordChangedAt || null,
        resetTokenHash: merged.resetTokenHash || null,
        resetTokenExpires: merged.resetTokenExpires != null ? String(merged.resetTokenExpires) : null,
        businessId: merged.businessId || null,
        isOwner: merged.isOwner ? 1 : 0,
      },
    });

    return merged;
  }

  /**
   * Team roster for a business - deliberately not `SELECT *`: passwordHash
   * and reset-token fields must never leave this method.
   * @returns {Promise<object[]>} oldest-first
   */
  async listByBusiness(businessId) {
    const rs = await this._db.execute({
      sql: 'SELECT id, name, email, isOwner, createdAt FROM users WHERE businessId = ? ORDER BY createdAt ASC',
      args: [businessId],
    });
    return rs.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      isOwner: !!row.isOwner,
      createdAt: row.createdAt,
    }));
  }

  /** @returns {Promise<number>} how many logins belong to this business */
  async countByBusiness(businessId) {
    const rs = await this._db.execute({
      sql: 'SELECT COUNT(*) as n FROM users WHERE businessId = ?',
      args: [businessId],
    });
    return Number(rs.rows[0].n);
  }
}

module.exports = UserRepository;