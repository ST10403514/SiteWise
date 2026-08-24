'use strict';

const Sentry = require('@sentry/node');
const AuthService = require('../services/AuthService');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const v = require('../utils/validators');
const { collectPhotoUrls } = require('../utils/photoCleanup');

const INDUSTRIES = new Set([
  'painting', 'plumbing', 'electrical', 'roofing', 'building', 'hvac',
  'landscaping', 'it', 'security', 'appliance', 'pest', 'solar',
  'flooring', 'glazing', 'automotive', 'general',
]);
const SCHEMES = new Set([
  'slate', 'forest', 'terracotta', 'ocean', 'charcoal', 'plum',
  'crimson', 'teal', 'midnight', 'graphite', 'burgundy', 'bronze',
  'indigo', 'pine', 'steel', 'aubergine', 'navy', 'emerald',
  'slateRose', 'cobalt',
]);
/**
 * Company profile captured during onboarding.
 * This is what turns SiteWise into the tenant's own branded suite:
 * identity, banking, industry presets and colour scheme.
 */
class ProfileController {
  constructor({ userRepository, businessRepository, jobRepository, storageService, paystackService, config }) {
    this._users = userRepository;
    this._businesses = businessRepository;
    this._jobs = jobRepository;
    this._storage = storageService;
    this._paystack = paystackService;
    this._config = config;
  }

  static _enum(value, allowed, field) {
    if (typeof value !== 'string' || !allowed.has(value)) {
      throw ApiError.badRequest(`Choose a valid ${field.toLowerCase()}`);
    }
    return value;
  }

  /**
   * Validate a tenant's custom chip presets: a list of short labels.
   * Trims, drops blanks, de-duplicates case-insensitively and caps the count.
   * @returns {string[]}
   */
  static _presetList(value, field, max = 40) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw ApiError.badRequest(`${field} must be a list`);
    if (value.length > max) {
      throw ApiError.badRequest(`You can save up to ${max} custom ${field.toLowerCase()}`);
    }
    const seen = new Set();
    const out = [];
    value.forEach((raw) => {
      if (typeof raw !== 'string') throw ApiError.badRequest(`${field} must be text`);
      const label = raw.trim().replace(/\s+/g, ' ');
      if (!label) return;
      if (label.length > 60) {
        throw ApiError.badRequest(`Each ${field.toLowerCase()} must be 60 characters or less`);
      }
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(label);
    });
    return out;
  }

  update = async (req, res, next) => {
    try {
      const b = req.body || {};
      const existing = req.user.profile || {};
      const profile = {
        companyName:  v.requireString(b.companyName, 'Company name', { max: 100 }),
        industry:     ProfileController._enum(b.industry, INDUSTRIES, 'Industry'),
        scheme:       ProfileController._enum(b.scheme, SCHEMES, 'Colour scheme'),
        tagline:      v.optionalString(b.tagline, 'Tagline', { max: 120 }),
        email:        v.requireEmail(b.email),
        city:         v.optionalString(b.city, 'City', { max: 100 }),
        addressLine:  v.optionalString(b.addressLine, 'Street address', { max: 160 }),
        phone:        v.optionalString(b.phone, 'Phone', { max: 40 }),
        whatsapp:     v.optionalString(b.whatsapp, 'WhatsApp number', { max: 40 }),
        website:      v.optionalString(b.website, 'Website', { max: 120 }),
        regNumber:    v.optionalString(b.regNumber, 'Registration number', { max: 60 }),
        vatNumber:    v.optionalString(b.vatNumber, 'VAT number', { max: 40 }),
        quoteValidity: v.optionalString(b.quoteValidity, 'Quote validity', { max: 80 }),
        quoteNotes:   v.optionalString(b.quoteNotes, 'Quote notes', { max: 400 }),
        bankName:     v.optionalString(b.bankName, 'Bank name', { max: 60 }),
        bankHolder:   v.optionalString(b.bankHolder, 'Account holder', { max: 100 }),
        bankAccount:  v.optionalString(b.bankAccount, 'Account number', { max: 40 }),
        branchCode:   v.optionalString(b.branchCode, 'Branch code', { max: 20 }),
        paymentTerms: v.optionalString(b.paymentTerms, 'Payment terms', { max: 200 })
                        || '50% deposit, balance on completion',
        logo:         v.optionalDataUrlImage(b.logo, 'Logo'),
        // Custom chips the tenant has added are kept unless explicitly replaced.
        customJobTypes: ProfileController._presetList(
          b.customJobTypes ?? existing.customJobTypes, 'Custom job types'),
        customMethods: ProfileController._presetList(
          b.customMethods ?? existing.customMethods, 'Custom methods'),
      };
      await this._businesses.update(req.user.businessId, { profile });
      const user = await this._users.update(req.user.id, { onboarded: true });
      user.profile = profile;
      res.json({ user: AuthService.toPublic(user) });
    } catch (err) { next(err); }
  };

  /**
   * Save only the tenant's custom chip presets, leaving the rest of the
   * profile untouched. Used when someone adds their own job type or method
   * from inside the job card.
   */
  updatePresets = async (req, res, next) => {
    try {
      const existing = req.user.profile;
      if (!existing) throw ApiError.badRequest('Finish setting up your business first');
      const b = req.body || {};
      const profile = {
        ...existing,
        customJobTypes: ProfileController._presetList(
          b.customJobTypes ?? existing.customJobTypes, 'Custom job types'),
        customMethods: ProfileController._presetList(
          b.customMethods ?? existing.customMethods, 'Custom methods'),
      };
      await this._businesses.update(req.user.businessId, { profile });
      req.user.profile = profile;
      res.json({ user: AuthService.toPublic(req.user) });
    } catch (err) { next(err); }
  };

  /**
   * "Delete my account" means something different depending on who's
   * asking, now that a business can have more than one login on it:
   *  - Sole owner (no teammates): full deletion, exactly as before - every
   *    R2 photo/receipt across every job, then the business and the user.
   *  - Owner with teammates still present: refused - removing them all
   *    first is required, so an owner can't accidentally take teammates'
   *    access to shared data down with their own account.
   *  - Any other team member: reinterpreted as "leave the team" - only
   *    their own login is removed. The business and its jobs/photos are
   *    untouched, since they belong to the business, not to them.
   * Irreversible where it does act, so the client is expected to have
   * already confirmed with the user before calling this.
   */
  deleteAccount = async (req, res, next) => {
    try {
      if (!req.user.isOwner) {
        await this._users.delete(req.user.id);
        res.clearCookie(this._config.cookieName);
        return res.json({ ok: true, left: true });
      }

      const memberCount = await this._users.countByBusiness(req.user.businessId);
      if (memberCount > 1) {
        throw ApiError.badRequest('Remove all team members before deleting your business');
      }

      // Deleting the account must not leave a Paystack subscription still
      // billing every month with no SiteWise account left to even see or
      // cancel it from. A failure here must not block the deletion the
      // user actually asked for - logged loudly instead, since it needs a
      // human to cancel it by hand on Paystack's side.
      const business = await this._businesses.findById(req.user.businessId);
      if (business?.subscriptionCode && business.subscriptionStatus === 'active') {
        try {
          const sub = await this._paystack.fetchSubscription(business.subscriptionCode);
          await this._paystack.disableSubscription({
            subscriptionCode: business.subscriptionCode,
            emailToken: sub.email_token,
          });
        } catch (err) {
          logger.error({ err, businessId: business.id, subscriptionCode: business.subscriptionCode },
            'Could not cancel the Paystack subscription during account deletion - will keep billing with no account left, needs manual cancellation');
          Sentry.captureException(err);
        }
      }

      const jobs = await this._jobs.listFullDataForBusiness(req.user.businessId);
      const urls = jobs.flatMap((data) => collectPhotoUrls(data));
      await Promise.all(urls.map((u) => this._storage.deleteObject(u)));

      await this._jobs.removeAllForBusiness(req.user.businessId);
      await this._users.delete(req.user.id);
      await this._businesses.delete(req.user.businessId);
      res.clearCookie(this._config.cookieName);
      res.json({ ok: true });
    } catch (err) { next(err); }
  };
}

module.exports = ProfileController;