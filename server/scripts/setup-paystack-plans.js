'use strict';

/**
 * One-off (but safely re-runnable) setup: creates the two Paystack Plan
 * objects billing checkout subscribes a business to. Idempotent - checks
 * for a plan with the matching name before creating one, so running this
 * again after the plans already exist just prints their existing codes
 * rather than duplicating them.
 *
 * Requires PAYSTACK_SECRET_KEY to already be set (test-mode key while
 * testing, obviously - never run this against a live key without meaning
 * to actually go live). Prints the two plan_code values this produces -
 * paste them into .env as PAYSTACK_PLAN_SOLO / PAYSTACK_PLAN_TEAM.
 *
 * Usage: node server/scripts/setup-paystack-plans.js
 */
require('dotenv').config();
const config = require('../config');
const PaystackService = require('../services/PaystackService');
const { SOLO_PRICE_CENTS, TEAM_PRICE_CENTS } = require('../utils/pricing');

async function main() {
  if (!config.paystack.secretKey) {
    console.error('PAYSTACK_SECRET_KEY is not set - add it to .env first, then re-run this.');
    process.exitCode = 1;
    return;
  }

  const paystack = new PaystackService(config.paystack);

  console.log('Creating (or finding existing) Paystack plans...\n');

  const soloCode = await paystack.ensurePlan({ name: 'SiteWise Solo', amountCents: SOLO_PRICE_CENTS });
  console.log(`Solo (R249.99/mo)  -> ${soloCode}`);

  const teamCode = await paystack.ensurePlan({ name: 'SiteWise Team', amountCents: TEAM_PRICE_CENTS });
  console.log(`Team (R849.99/mo)  -> ${teamCode}`);

  console.log('\nAdd these to .env:');
  console.log(`PAYSTACK_PLAN_SOLO=${soloCode}`);
  console.log(`PAYSTACK_PLAN_TEAM=${teamCode}`);
}

main().catch((err) => {
  console.error('Paystack plan setup failed:', err);
  process.exitCode = 1;
});
