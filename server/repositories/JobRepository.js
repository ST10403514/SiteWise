'use strict';

const fs = require('fs');
const path = require('path');

/**
 * File-backed job store, scoped per user.
 * Same contract idea as UserRepository - swap for a database
 * implementation without touching controllers.
 */
class JobRepository {
  /** @param {string} filePath Absolute path of the JSON store */
  constructor(filePath) {
    this._filePath = filePath;
    this._jobs = this._load(); // [{ id, userId, data, updatedAt }]
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this._filePath, 'utf8'));
    } catch {
      return [];
    }
  }

  _persist() {
    fs.mkdirSync(path.dirname(this._filePath), { recursive: true });
    const tmp = `${this._filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this._jobs), { mode: 0o600 });
    fs.renameSync(tmp, this._filePath);
  }

  /**
   * Lightweight summaries for the dashboard (no photo payloads).
   * @returns {object[]} newest first
   */
  listByUser(userId) {
    return this._jobs
      .filter((j) => j.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((j) => ({
        id: j.id,
        quoteNumber: j.data.quoteNumber,
        clientName: j.data.clientName,
        siteAddress: j.data.siteAddress,
        outcome: j.data.outcome,
        grandTotal: j.data.grandTotal,
        photoCount: Array.isArray(j.data.photos) ? j.data.photos.length : 0,
        updatedAt: j.updatedAt,
      }));
  }

  /** @returns {object|null} full record, only if owned by userId */
  findByIdForUser(id, userId) {
    const job = this._jobs.find((j) => j.id === id && j.userId === userId);
    return job || null;
  }

  /** Create or replace a job owned by userId. @returns {object} */
  upsert(id, userId, data) {
    const existing = this._jobs.find((j) => j.id === id);
    if (existing && existing.userId !== userId) {
      const err = new Error('Job belongs to another user');
      err.code = 'FORBIDDEN';
      throw err;
    }
    const record = existing || { id, userId };
    record.data = data;
    record.updatedAt = new Date().toISOString();
    if (!existing) this._jobs.push(record);
    this._persist();
    return record;
  }

  /** @returns {boolean} true if a job was removed */
  removeForUser(id, userId) {
    const before = this._jobs.length;
    this._jobs = this._jobs.filter((j) => !(j.id === id && j.userId === userId));
    const removed = this._jobs.length !== before;
    if (removed) this._persist();
    return removed;
  }
}

module.exports = JobRepository;
