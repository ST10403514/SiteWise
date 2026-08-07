'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Authentication use-cases: signup, login, and password reset.
 * Knows nothing about HTTP - controllers translate to/from requests.
 */
class AuthService {
  /**
   * @param {import('../repositories/UserRepository')} userRepository
   * @param {{ emailService?: object, appBaseUrl?: string }} [deps]
   */
  constructor(userRepository, deps = {}) {
    this._users = userRepository;
    this._email = deps.emailService || null;
    this._appBaseUrl = deps.appBaseUrl || '';
  }

  async signup({ name, email, password, acceptedTerms }) {
    if (!acceptedTerms) {
      throw ApiError.badRequest('You must accept the Terms & Conditions to create an account');
    }
    if (await this._users.findByEmail(email)) {
      throw ApiError.conflict('An account with that email already exists');
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this._users.create({ name, email, passwordHash });
    await this._users.update(user.id, { acceptedTermsAt: new Date().toISOString() });
    return this._users.findById(user.id);
  }

  async login({ email, password }) {
    const user = await this._users.findByEmail(email);
    const hash = user ? user.passwordHash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali';
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) throw ApiError.unauthorized('Incorrect email or password');
    return user;
  }

  static _hashToken(raw) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Begin a password reset. ALWAYS resolves the same way whether or not the
   * email exists (no account enumeration). If the account exists and email is
   * configured, a reset link is sent.
   * @param {{ email: string }} input
   */
  async requestPasswordReset({ email }) {
    const user = await this._users.findByEmail(email);
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = AuthService._hashToken(rawToken);
      const resetTokenExpires = Date.now() + RESET_TOKEN_TTL_MS;
      await this._users.update(user.id, { resetTokenHash, resetTokenExpires });

      if (this._email && this._email.configured) {
        const resetUrl = `${this._appBaseUrl}/reset-password?token=${rawToken}`;
        try {
          await this._email.sendPasswordReset({ to: user.email, resetUrl, name: user.name });
        } catch (e) {
          // Don't leak send failures to the caller; log for the operator.
          console.error('Password reset email failed:', e.message);
        }
      }
    }
    // Uniform result regardless of existence.
    return { ok: true };
  }

  /**
   * Complete a password reset using the raw token from the email link.
   * @param {{ token: string, password: string }} input
   */
  async resetPassword({ token, password }) {
    if (!token) throw ApiError.badRequest('Invalid or expired reset link');
    const resetTokenHash = AuthService._hashToken(token);
    const user = await this._users.findByResetTokenHash(resetTokenHash);

    if (!user || !user.resetTokenExpires || Date.now() > user.resetTokenExpires) {
      throw ApiError.badRequest('This reset link is invalid or has expired. Please request a new one.');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    // Update password AND clear the token so it can't be reused.
    await this._users.update(user.id, {
      passwordHash,
      resetTokenHash: null,
      resetTokenExpires: null,
    });
    return { ok: true };
  }

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