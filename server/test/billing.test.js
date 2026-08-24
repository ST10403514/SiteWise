'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { freshApp, listen } = require('./helpers/testApp');

const TEST_SECRET = 'test-paystack-secret';

let baseUrl;
let close;
let businessRepository;

before(async () => {
  // config.js reads these once at require-time - set before freshApp()
  // clears the module cache and re-requires it, per testApp.js's own doc.
  process.env.PAYSTACK_SECRET_KEY = TEST_SECRET;
  process.env.PAYSTACK_PUBLIC_KEY = 'test-public-key';
  process.env.PAYSTACK_PLAN_SOLO = 'PLN_test_solo';
  process.env.PAYSTACK_PLAN_TEAM = 'PLN_test_team';

  const { app } = await freshApp();
  ({ baseUrl, close } = await listen(app));

  const config = require('../config');
  const BusinessRepository = require('../repositories/BusinessRepository');
  businessRepository = new BusinessRepository(config.db);
});

after(() => close());

async function signup(email = `billing-${crypto.randomUUID()}@example.com`) {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Billing Test', email, password: 'a-fine-password-1', acceptedTerms: true }),
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  // toPublic() deliberately doesn't expose the raw businessId to the client
  // (see AuthService.toPublic) - looked up directly here instead, same as
  // jobQuota.test.js's lookupBusinessId.
  const businessId = await lookupBusinessId(email);
  return { cookie, businessId, email };
}

async function lookupBusinessId(email) {
  const { getClient } = require('../repositories/db');
  const config = require('../config');
  const rs = await getClient(config.db).execute({ sql: 'SELECT businessId FROM users WHERE email = ?', args: [email] });
  return rs.rows[0].businessId;
}

async function lookupUserId(email) {
  const { getClient } = require('../repositories/db');
  const config = require('../config');
  const rs = await getClient(config.db).execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
  return rs.rows[0].id;
}

/** Signs a synthetic webhook payload exactly the way Paystack would, so the
 * real signature-verification code path is exercised, not bypassed. */
function sendWebhook(event, data, { secret = TEST_SECRET } = {}) {
  const body = JSON.stringify({ event, data });
  const signature = crypto.createHmac('sha512', secret).update(body).digest('hex');
  return fetch(`${baseUrl}/api/billing/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature },
    body,
  });
}

test('a webhook with a valid signature is accepted', async () => {
  const { businessId } = await signup();
  const res = await sendWebhook('charge.success', {
    metadata: { businessId, tier: 'solo' },
    customer: { customer_code: 'CUS_test_valid' },
  });
  assert.equal(res.status, 200);
});

test('a webhook with a missing/wrong signature is rejected, business untouched', async () => {
  const { businessId } = await signup();
  const body = JSON.stringify({ event: 'charge.success', data: { metadata: { businessId, tier: 'solo' } } });
  const res = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-paystack-signature': 'not-a-real-signature' },
    body,
  });
  assert.equal(res.status, 401);
  const business = await businessRepository.findById(businessId);
  assert.equal(business.tier, 'free');
});

test('a webhook signed with the wrong secret is rejected', async () => {
  const { businessId } = await signup();
  const res = await sendWebhook(
    'charge.success',
    { metadata: { businessId, tier: 'solo' } },
    { secret: 'totally-wrong-secret' },
  );
  assert.equal(res.status, 401);
});

test('charge.success with metadata activates the business onto the right tier', async () => {
  const { businessId } = await signup();
  const res = await sendWebhook('charge.success', {
    metadata: { businessId, tier: 'solo' },
    customer: { customer_code: 'CUS_test_activate' },
  });
  assert.equal(res.status, 200);
  const business = await businessRepository.findById(businessId);
  assert.equal(business.tier, 'solo');
  assert.equal(business.subscriptionStatus, 'active');
  assert.equal(business.paystackCustomerCode, 'CUS_test_activate');
});

test('upgrading tries to disable the previous subscription, but activation is never blocked if that fails', async () => {
  // Confirmed for real against the live API: upgrading Solo -> Team left
  // two fully independent subscriptions running, each billing separately,
  // because starting a new checkout never touches whatever was already
  // active. The fix disables the old one during charge.success - this
  // test can't reach Paystack's real API (no real secret key here), so
  // that disable attempt genuinely fails, which is exactly what proves
  // the actually-important behavior: a reconciliation failure must never
  // stop the customer getting what they just paid for.
  const { businessId } = await signup();
  await businessRepository.activateSubscription(businessId, { tier: 'solo', paystackCustomerCode: 'CUS_test_upgrade' });
  await businessRepository.recordSubscription(businessId, { subscriptionCode: 'SUB_test_old_solo', subscriptionRenewsAt: '2026-09-20T00:00:00.000Z' });

  const res = await sendWebhook('charge.success', {
    metadata: { businessId, tier: 'team' },
    customer: { customer_code: 'CUS_test_upgrade' },
  });
  assert.equal(res.status, 200);
  const business = await businessRepository.findById(businessId);
  assert.equal(business.tier, 'team', 'the paid-for upgrade must still apply even though disabling the old subscription failed');
  assert.equal(business.subscriptionStatus, 'active');
});

test('redelivering the same charge.success event is a harmless no-op', async () => {
  const { businessId } = await signup();
  const data = { metadata: { businessId, tier: 'team' }, customer: { customer_code: 'CUS_test_redeliver' } };
  await sendWebhook('charge.success', data);
  const res = await sendWebhook('charge.success', data); // Paystack's at-least-once redelivery
  assert.equal(res.status, 200);
  const business = await businessRepository.findById(businessId);
  assert.equal(business.tier, 'team');
});

test('subscription.create records the subscription code and renewal date', async () => {
  const { businessId } = await signup();
  await businessRepository.activateSubscription(businessId, { tier: 'solo', paystackCustomerCode: 'CUS_test_subcreate' });
  await sendWebhook('subscription.create', {
    customer: { customer_code: 'CUS_test_subcreate' },
    subscription_code: 'SUB_test_123',
    next_payment_date: '2026-09-20T00:00:00.000Z',
  });
  const business = await businessRepository.findById(businessId);
  assert.equal(business.subscriptionCode, 'SUB_test_123');
  assert.equal(business.subscriptionRenewsAt, '2026-09-20T00:00:00.000Z');
});

test('subscription.create arriving BEFORE charge.success still resolves, via email', async () => {
  // Observed for real: Paystack doesn't guarantee delivery order, and
  // subscription.create carries no metadata at all - if it lands before
  // the charge.success that writes paystackCustomerCode onto the business,
  // neither the metadata nor the customer_code lookup has anything to
  // match yet, even though the business is real and already exists.
  const { businessId, email } = await signup();
  const res = await sendWebhook('subscription.create', {
    customer: { customer_code: 'CUS_never_seen_yet', email },
    subscription_code: 'SUB_test_early',
    next_payment_date: '2026-09-20T00:00:00.000Z',
  });
  assert.equal(res.status, 200);
  const business = await businessRepository.findById(businessId);
  assert.equal(business.subscriptionCode, 'SUB_test_early');
});

test('subscription.disable marks cancelled but does not touch tier', async () => {
  const { businessId } = await signup();
  await businessRepository.activateSubscription(businessId, { tier: 'solo', paystackCustomerCode: 'CUS_test_disable' });
  await sendWebhook('subscription.disable', { customer: { customer_code: 'CUS_test_disable' } });
  const business = await businessRepository.findById(businessId);
  assert.equal(business.subscriptionStatus, 'cancelled');
  assert.equal(business.tier, 'solo', 'tier stays until the paid period actually ends - see effectiveTier');
});

test('subscription.not_renew is handled the same as subscription.disable', async () => {
  const { businessId } = await signup();
  await businessRepository.activateSubscription(businessId, { tier: 'team', paystackCustomerCode: 'CUS_test_notrenew' });
  await sendWebhook('subscription.not_renew', { customer: { customer_code: 'CUS_test_notrenew' } });
  const business = await businessRepository.findById(businessId);
  assert.equal(business.subscriptionStatus, 'cancelled');
});

test('a late subscription.disable about a SUPERSEDED subscription does not cancel the new one', async () => {
  // Reproduces exactly what happened for real: upgrading disables the old
  // subscription, which fires its own subscription.disable webhook - if
  // that arrives before subscription.create for the NEW subscription has
  // updated subscriptionCode, a naive check would misread it as cancelling
  // whatever the business just upgraded to.
  const { businessId } = await signup();
  await businessRepository.activateSubscription(businessId, { tier: 'solo', paystackCustomerCode: 'CUS_test_supersede' });
  await businessRepository.recordSubscription(businessId, { subscriptionCode: 'SUB_test_old', subscriptionRenewsAt: '2026-09-20T00:00:00.000Z' });

  // The upgrade: charge.success for team, which marks SUB_test_old superseded.
  await sendWebhook('charge.success', {
    metadata: { businessId, tier: 'team' },
    customer: { customer_code: 'CUS_test_supersede' },
  });
  let business = await businessRepository.findById(businessId);
  assert.equal(business.tier, 'team');
  assert.equal(business.subscriptionStatus, 'active', 'must still be active immediately after the upgrade');

  // The late-arriving notification about the OLD subscription, deliberately
  // sent BEFORE subscription.create for the new one - business.subscriptionCode
  // is still SUB_test_old at this exact point, which is exactly the
  // scenario that broke without the supersededSubscriptionCode guard.
  await sendWebhook('subscription.disable', {
    customer: { customer_code: 'CUS_test_supersede' },
    subscription_code: 'SUB_test_old',
  });
  business = await businessRepository.findById(businessId);
  assert.equal(business.subscriptionStatus, 'active', 'the late notification about the superseded subscription must be ignored');
  assert.equal(business.tier, 'team');
});

test('invoice.payment_failed marks the business past_due, tier untouched', async () => {
  const { businessId } = await signup();
  await businessRepository.activateSubscription(businessId, { tier: 'solo', paystackCustomerCode: 'CUS_test_failed' });
  await sendWebhook('invoice.payment_failed', { customer: { customer_code: 'CUS_test_failed' } });
  const business = await businessRepository.findById(businessId);
  assert.equal(business.subscriptionStatus, 'past_due');
  assert.equal(business.tier, 'solo');
});

test('a webhook for an unrecognized customer_code is a safe no-op, not an error', async () => {
  const res = await sendWebhook('subscription.disable', { customer: { customer_code: 'CUS_never_seen' } });
  assert.equal(res.status, 200);
});

test('effectiveTier: a cancelled subscription keeps working until subscriptionRenewsAt passes', async () => {
  const { cookie, businessId } = await signup();
  await businessRepository.activateSubscription(businessId, { tier: 'solo', paystackCustomerCode: 'CUS_test_lapse' });
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await businessRepository.recordSubscription(businessId, { subscriptionCode: 'SUB_test_lapse', subscriptionRenewsAt: future });
  await businessRepository.setSubscriptionStatus(businessId, 'cancelled');

  const stillPaid = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  const stillPaidBody = await stillPaid.json();
  assert.equal(stillPaidBody.user.tier, 'solo', 'not yet lapsed - the paid period has not ended');

  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await businessRepository.recordSubscription(businessId, { subscriptionCode: 'SUB_test_lapse', subscriptionRenewsAt: past });

  const lapsed = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  const lapsedBody = await lapsed.json();
  assert.equal(lapsedBody.user.tier, 'free', 'the paid period has ended - access reverts to free');
});

test('POST /checkout rejects an invalid tier', async () => {
  const { cookie } = await signup();
  const res = await fetch(`${baseUrl}/api/billing/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ tier: 'not-a-real-tier' }),
  });
  assert.equal(res.status, 400);
});

test('POST /cancel with no active subscription is rejected', async () => {
  const { cookie } = await signup();
  const res = await fetch(`${baseUrl}/api/billing/cancel`, { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(res.status, 400);
});

test('a non-owner gets 403 on both checkout and cancel', async () => {
  // Team accounts already have a real invite mechanism - reuse it rather
  // than hand-rolling a second login onto the same business here.
  const TeamService = require('../services/TeamService');
  const UserRepository = require('../repositories/UserRepository');
  const InviteRepository = require('../repositories/InviteRepository');
  const config = require('../config');
  let capturedInviteUrl;
  const teamService = new TeamService(
    new UserRepository(config.db), businessRepository, new InviteRepository(config.db),
    {
      emailService: { configured: true, sendInvite: async ({ inviteUrl }) => { capturedInviteUrl = inviteUrl; } },
      appBaseUrl: 'http://test',
    },
  );

  const { businessId, email: ownerEmail } = await signup();
  await businessRepository.updateTier(businessId, 'team');
  const ownerId = await lookupUserId(ownerEmail);
  await teamService.invite({ businessId, invitedByUserId: ownerId, email: `teammate-${crypto.randomUUID()}@example.com` });
  const token = new URL(capturedInviteUrl).searchParams.get('token');
  const acceptRes = await fetch(`${baseUrl}/api/auth/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, name: 'Teammate', password: 'a-fine-password-1', acceptedTerms: true }),
  });
  const teammateCookie = acceptRes.headers.get('set-cookie').split(';')[0];

  const checkoutRes = await fetch(`${baseUrl}/api/billing/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: teammateCookie },
    body: JSON.stringify({ tier: 'solo' }),
  });
  assert.equal(checkoutRes.status, 403);

  const cancelRes = await fetch(`${baseUrl}/api/billing/cancel`, { method: 'POST', headers: { Cookie: teammateCookie } });
  assert.equal(cancelRes.status, 403);
});

test('deleting a sole-owner account with an active subscription still deletes the account', async () => {
  // The subscription-cancel attempt inside deleteAccount hits Paystack's
  // real API with this test's fake secret key, so it genuinely fails here -
  // exactly like the upgrade-resilience test, that's what proves account
  // deletion is never blocked by a failure to reach Paystack.
  const { cookie, businessId } = await signup();
  await businessRepository.activateSubscription(businessId, { tier: 'solo', paystackCustomerCode: 'CUS_test_delete' });
  await businessRepository.recordSubscription(businessId, { subscriptionCode: 'SUB_test_delete', subscriptionRenewsAt: '2026-09-20T00:00:00.000Z' });

  const res = await fetch(`${baseUrl}/api/profile`, { method: 'DELETE', headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  assert.equal(await businessRepository.findById(businessId), null, 'the business must actually be gone');
});
