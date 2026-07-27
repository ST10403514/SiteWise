'use strict';

const AuthService = require('../services/AuthService');
const ApiError = require('../utils/ApiError');
const v = require('../utils/validators');

const INDUSTRIES = new Set([
  'painting', 'plumbing', 'electrical', 'roofing',
  'building', 'hvac', 'landscaping', 'general',
]);
const SCHEMES = new Set([
  'slate', 'forest', 'terracotta', 'ocean', 'charcoal', 'plum',
]);

/**
 * Company profile captured during onboarding.
 * This is what turns SiteWise into the tenant's own branded suite:
 * identity, banking, industry presets and colour scheme.
 */
class ProfileController {
  constructor({ userRepository }) {
    this._users = userRepository;
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

  update = (req, res, next) => {
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
      const user = this._users.update(req.user.id, { profile, onboarded: true });
      res.json({ user: AuthService.toPublic(user) });
    } catch (err) { next(err); }
  };

  /**
   * Save only the tenant's custom chip presets, leaving the rest of the
   * profile untouched. Used when someone adds their own job type or method
   * from inside the job card.
   */
  updatePresets = (req, res, next) => {
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
      const user = this._users.update(req.user.id, { profile });
      res.json({ user: AuthService.toPublic(user) });
    } catch (err) { next(err); }
  };
}

module.exports = ProfileController;