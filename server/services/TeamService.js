'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const ApiError = require('../utils/ApiError');
const { jobQuota } = require('../utils/jobQuota');

const SALT_ROUNDS = 12;
// Longer than a password-reset token's 1-hour TTL - an invite realistically
// sits in an inbox longer before someone gets around to accepting it.
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Inviting/joining/managing a business's team. Kept separate from
 * AuthService (which owns signup/login/password-reset) - a deliberate
 * one-concern-per-service split, matching how this codebase already
 * separates JobController from ProfileController from AuthController.
 */
class TeamService {
  /**
   * @param {import('../repositories/UserRepository')} userRepository
   * @param {import('../repositories/BusinessRepository')} businessRepository
   * @param {import('../repositories/InviteRepository')} inviteRepository
   * @param {{ emailService?: object, appBaseUrl?: string }} [deps]
   */
  constructor(userRepository, businessRepository, inviteRepository, deps = {}) {
    this._users = userRepository;
    this._businesses = businessRepository;
    this._invites = inviteRepository;
    this._email = deps.emailService || null;
    this._appBaseUrl = deps.appBaseUrl || '';
  }

  static _hashToken(raw) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /** @param {{businessId: string, invitedByUserId: string, email: string}} input */
  async invite({ businessId, invitedByUserId, email }) {
    const business = await this._businesses.findById(businessId);
    // The only thing 'tier' currently gates. 402, not 403 - this isn't "not
    // allowed", it's "needs upgrading", and the frontend needs to tell the
    // two apart (an owner always passes requireOwner's 403 check by the
    // time they reach here, so a 403 here would be indistinguishable from
    // that). No self-serve upgrade yet, so this is a real dead end for a
    // free/solo business today - the message says so rather than
    // pretending there's a button to press.
    if (!business || business.tier !== 'team') {
      throw new ApiError(402, 'Inviting a team member needs the Team plan - contact us to upgrade.');
    }
    // Not anti-enumeration-safe like forgotPassword, deliberately - this is
    // an authenticated, owner-only action about someone the owner already
    // knows they want to invite, so useful error feedback matters more here
    // than the marginal enumeration protection that matters on a public,
    // unauthenticated endpoint.
    if (await this._users.findByEmail(email)) {
      throw ApiError.conflict('An account with that email already exists');
    }
    // Invalidate any earlier still-pending invite for this person, so
    // re-clicking "invite" never leaves two live tokens.
    await this._invites.deletePendingByEmail(businessId, email);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = TeamService._hashToken(rawToken);
    const expiresAt = Date.now() + INVITE_TOKEN_TTL_MS;
    await this._invites.create({ businessId, email, invitedByUserId, tokenHash, expiresAt });

    if (this._email && this._email.configured) {
      const inviter = await this._users.findById(invitedByUserId);
      const inviteUrl = `${this._appBaseUrl}/accept-invite?token=${rawToken}`;
      try {
        await this._email.sendInvite({
          to: email,
          inviteUrl,
          businessName: business?.profile?.companyName,
          inviterName: inviter?.name,
        });
      } catch {
        // Same posture as password reset: don't fail the request over a
        // send failure, the invite row already exists and can be resent.
      }
    }
    return { ok: true };
  }

  /**
   * @param {{token: string, name: string, password: string, acceptedTerms: boolean}} input
   * @returns the new user, with `.profile` already attached from the business
   */
  async acceptInvite({ token, name, password, acceptedTerms }) {
    if (!acceptedTerms) {
      throw ApiError.badRequest('You must accept the Terms & Conditions to join');
    }
    if (!token) throw ApiError.badRequest('Invalid or expired invite link');

    const tokenHash = TeamService._hashToken(token);
    const invite = await this._invites.findByTokenHash(tokenHash);
    if (!invite || invite.acceptedAt || Date.now() > invite.expiresAt) {
      throw ApiError.badRequest('This invite link is invalid or has expired - ask the owner to send a new one.');
    }
    // Race-condition guard: someone else could have signed up with this
    // email between the invite being sent and it being accepted.
    if (await this._users.findByEmail(invite.email)) {
      throw ApiError.conflict('An account with that email already exists');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this._users.create({
      name, email: invite.email, passwordHash, businessId: invite.businessId, isOwner: false,
    });
    // The business is already set up - there's nothing left for an invited
    // teammate to fill in, so onboarded is true from the start (skips the
    // wizard entirely; SessionGuard.destinationFor(user) then just works).
    await this._users.update(user.id, { acceptedTermsAt: new Date().toISOString(), onboarded: true });
    await this._invites.markAccepted(invite.id);

    const business = await this._businesses.findById(invite.businessId);
    const finalUser = await this._users.findById(user.id);
    finalUser.profile = business ? business.profile : null;
    finalUser.tier = business ? business.tier : 'free';
    finalUser.jobQuota = business ? jobQuota(business) : null;
    return finalUser;
  }

  /** @returns {Promise<object[]>} name/email/isOwner only - never passwordHash */
  async listMembers({ businessId }) {
    return this._users.listByBusiness(businessId);
  }

  /** @param {{businessId: string, requestingUserId: string, targetUserId: string}} input */
  async removeMember({ businessId, requestingUserId, targetUserId }) {
    if (targetUserId === requestingUserId) {
      throw ApiError.badRequest("Owners can't remove themselves - delete your account instead");
    }
    const target = await this._users.findById(targetUserId);
    if (!target || target.businessId !== businessId) {
      throw new ApiError(404, 'No such team member');
    }
    // Deliberately doesn't touch jobs - they stay with the business.
    await this._users.delete(targetUserId);
    return { ok: true };
  }
}

module.exports = TeamService;
