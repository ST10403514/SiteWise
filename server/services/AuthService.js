'use strict';

const bcrypt = require('bcryptjs');
const ApiError = require('../utils/ApiError');

const SALT_ROUNDS = 12;

/**
 * Authentication use-cases: signup and login.
 * Knows nothing about HTTP - controllers translate to/from requests.
 */
class AuthService {
  /** @param {import('../repositories/UserRepository')} userRepository */
  constructor(userRepository) {
    this._users = userRepository;
  }

  /**
   * @param {{name: string, email: string, password: string}} input (pre-validated)
   * @returns {Promise<object>} the created user
   */
  async signup({ name, email, password }) {
    if (this._users.findByEmail(email)) {
      throw ApiError.conflict('An account with that email already exists');
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    return this._users.create({ name, email, passwordHash });
  }

  /**
   * @param {{email: string, password: string}} input
   * @returns {Promise<object>} the authenticated user
   */
  async login({ email, password }) {
    const user = this._users.findByEmail(email);
    // Always run a hash comparison so response timing does not reveal
    // whether the email exists.
    const hash = user ? user.passwordHash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali';
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) throw ApiError.unauthorized('Incorrect email or password');
    return user;
  }

  /** Public projection of a user record - never expose the hash. */
  static toPublic(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      onboarded: user.onboarded,
      profile: user.profile,
    };
  }
}

module.exports = AuthService;
