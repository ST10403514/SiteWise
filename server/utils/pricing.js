'use strict';

/**
 * Single source of truth for tier pricing - read by both BillingController
 * (checkout) and scripts/setup-paystack-plans.js (creating the Paystack
 * Plan objects), so the two can never quietly drift apart.
 *
 * Amounts are in the smallest unit of the currency - cents for ZAR. Kept as
 * whole numbers throughout (R249.99 -> 24999) to avoid float rounding ever
 * touching a real charge amount.
 */
const SOLO_PRICE_CENTS = 24999; // R249.99/mo
const TEAM_PRICE_CENTS = 84999; // R849.99/mo, flat for up to 5 users

module.exports = { SOLO_PRICE_CENTS, TEAM_PRICE_CENTS };
