'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * File-backed user store.
 * Keeps all users in memory and persists atomically to a JSON file.
 * Swap this class for a database-backed implementation without touching
 * the service layer - the public interface is the contract.
 */
class UserRepository {
  /** @param {string} filePath Absolute path of the JSON store */
  constructor(filePath) {
    this._filePath = filePath;
    this._users = this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this._filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  _persist() {
    fs.mkdirSync(path.dirname(this._filePath), { recursive: true });
    const tmp = `${this._filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this._users, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this._filePath);
  }

  /** @returns {object|null} */
  findByEmail(email) {
    return this._users.find(u => u.email === email) || null;
  }

  /** @returns {object|null} */
  findById(id) {
    return this._users.find(u => u.id === id) || null;
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
    this._users.push(user);
    this._persist();
    return user;
  }

  /**
   * Shallow-merge changes into an existing user.
   * @returns {object} the updated user record
   */
  update(id, changes) {
    const user = this.findById(id);
    if (!user) throw new Error(`User ${id} not found`);
    Object.assign(user, changes);
    this._persist();
    return user;
  }
}

module.exports = UserRepository;
