'use strict';

const crypto = require('crypto');
const { getClient } = require('./db');

/**
 * Pending team invites. Mirrors the password-reset token pattern: only a
 * SHA-256 hash of the invite token is ever persisted - the raw token exists
 * only transiently, on its way to the invitee's inbox.
 */
class InviteRepository {
  constructor(config) {
    this._db = getClient(config);
  }

  _hydrate(row) {
    if (!row) return null;
    return {
      id: row.id,
      businessId: row.businessId,
      email: row.email,
      invitedByUserId: row.invitedByUserId,
      tokenHash: row.tokenHash,
      expiresAt: Number(row.expiresAt),
      acceptedAt: row.acceptedAt || null,
      createdAt: row.createdAt,
    };
  }

  /** @param {{businessId, email, invitedByUserId, tokenHash, expiresAt: number}} input */
  async create({ businessId, email, invitedByUserId, tokenHash, expiresAt }) {
    const invite = {
      id: crypto.randomUUID(),
      businessId,
      email,
      invitedByUserId,
      tokenHash,
      expiresAt,
      acceptedAt: null,
      createdAt: new Date().toISOString(),
    };
    await this._db.execute({
      sql: `INSERT INTO invites (id, businessId, email, invitedByUserId, tokenHash, expiresAt, acceptedAt, createdAt)
            VALUES (:id, :businessId, :email, :invitedByUserId, :tokenHash, :expiresAt, :acceptedAt, :createdAt)`,
      args: {
        id: invite.id,
        businessId,
        email,
        invitedByUserId,
        tokenHash,
        expiresAt: String(expiresAt),
        acceptedAt: null,
        createdAt: invite.createdAt,
      },
    });
    return invite;
  }

  async findByTokenHash(tokenHash) {
    const rs = await this._db.execute({
      sql: 'SELECT * FROM invites WHERE tokenHash = ?',
      args: [tokenHash],
    });
    return this._hydrate(rs.rows[0]);
  }

  /** Any not-yet-accepted invite for this email at this business - used to invalidate before re-inviting. */
  async findPendingByEmail(businessId, email) {
    const rs = await this._db.execute({
      sql: 'SELECT * FROM invites WHERE businessId = ? AND email = ? AND acceptedAt IS NULL',
      args: [businessId, email],
    });
    return rs.rows.map((row) => this._hydrate(row));
  }

  async deletePendingByEmail(businessId, email) {
    await this._db.execute({
      sql: 'DELETE FROM invites WHERE businessId = ? AND email = ? AND acceptedAt IS NULL',
      args: [businessId, email],
    });
  }

  async markAccepted(id) {
    await this._db.execute({
      sql: 'UPDATE invites SET acceptedAt = :acceptedAt WHERE id = :id',
      args: { id, acceptedAt: new Date().toISOString() },
    });
  }
}

module.exports = InviteRepository;
