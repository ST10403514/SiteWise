'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { freshApp, listen } = require('./helpers/testApp');

let baseUrl;
let close;
let businessRepository;

before(async () => {
  const { app } = await freshApp();
  ({ baseUrl, close } = await listen(app));

  const config = require('../config');
  const BusinessRepository = require('../repositories/BusinessRepository');
  businessRepository = new BusinessRepository(config.db);
});

after(() => close());

async function signup(email = `test-${crypto.randomUUID()}@example.com`) {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Quota Test', email, password: 'a-fine-password-1', acceptedTerms: true }),
  });
  const { user } = await res.json();
  return { cookie: res.headers.get('set-cookie').split(';')[0], businessId: user.businessId, email };
}

async function lookupBusinessId(email) {
  const { getClient } = require('../repositories/db');
  const config = require('../config');
  const rs = await getClient(config.db).execute({ sql: 'SELECT businessId FROM users WHERE email = ?', args: [email] });
  return rs.rows[0].businessId;
}

function createJob(cookie, id = crypto.randomUUID()) {
  return fetch(`${baseUrl}/api/jobs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ data: { quoteNumber: 'Q-1', clientName: 'Quota test client' } }),
  });
}

test('a free-tier business can create up to 5 jobs, the 6th is rejected with 402', async () => {
  const { cookie } = await signup();

  for (let i = 0; i < 5; i++) {
    const res = await createJob(cookie);
    assert.equal(res.status, 200, `job ${i + 1} of 5 should succeed`);
  }

  const sixth = await createJob(cookie);
  assert.equal(sixth.status, 402, 'a 6th new job in the same month should be rejected');
  const body = await sixth.json();
  assert.match(body.error, /free/i);
});

test('deleting a job does not refund the monthly count', async () => {
  const { cookie } = await signup();
  const ids = Array.from({ length: 5 }, () => crypto.randomUUID());

  for (const id of ids) {
    const res = await createJob(cookie, id);
    assert.equal(res.status, 200);
  }

  const del = await fetch(`${baseUrl}/api/jobs/${ids[0]}`, { method: 'DELETE', headers: { Cookie: cookie } });
  assert.equal(del.status, 200);

  const afterDelete = await createJob(cookie);
  assert.equal(afterDelete.status, 402, 'deleting one of the 5 should not free up a new slot');
});

test('updating an existing job is never blocked by the cap, even once at it', async () => {
  const { cookie } = await signup();
  const existingId = crypto.randomUUID();
  await createJob(cookie, existingId); // 1 of 5

  for (let i = 0; i < 4; i++) await createJob(cookie); // fills the remaining 4

  // Confirmed at cap - a genuinely new job is rejected here.
  const blocked = await createJob(cookie);
  assert.equal(blocked.status, 402);

  // But re-saving (autosaving) one of the 5 that already exist must still work.
  const update = await fetch(`${baseUrl}/api/jobs/${existingId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ data: { quoteNumber: 'Q-1', clientName: 'Edited after hitting the cap' } }),
  });
  assert.equal(update.status, 200);
});

test('a solo-tier business is never capped', async () => {
  const { cookie, email } = await signup();
  const businessId = await lookupBusinessId(email);
  await businessRepository.updateTier(businessId, 'solo');

  for (let i = 0; i < 7; i++) {
    const res = await createJob(cookie);
    assert.equal(res.status, 200, `solo tier job ${i + 1} should never be capped`);
  }
});

test('a team-tier business is never capped', async () => {
  const { cookie, email } = await signup();
  const businessId = await lookupBusinessId(email);
  await businessRepository.updateTier(businessId, 'team');

  for (let i = 0; i < 7; i++) {
    const res = await createJob(cookie);
    assert.equal(res.status, 200, `team tier job ${i + 1} should never be capped`);
  }
});

test('the counter rolls over once the stored month has passed', async () => {
  const { cookie, email } = await signup();
  const businessId = await lookupBusinessId(email);

  for (let i = 0; i < 5; i++) await createJob(cookie);
  const blocked = await createJob(cookie);
  assert.equal(blocked.status, 402, 'sanity check: genuinely at cap this month');

  // Simulate "that was last month" directly, the way the lazy-rollover logic
  // is meant to be exercised (there's no clock to fast-forward otherwise).
  const { getClient } = require('../repositories/db');
  const config = require('../config');
  await getClient(config.db).execute({
    sql: 'UPDATE businesses SET jobsCreatedMonthKey = ? WHERE id = ?',
    args: ['2000-01', businessId],
  });

  const afterRollover = await createJob(cookie);
  assert.equal(afterRollover.status, 200, 'a new month should start the count fresh again');
});

test('GET /api/auth/me reports accurate jobQuota for the signed-in user', async () => {
  const { cookie } = await signup();
  await createJob(cookie);
  await createJob(cookie);

  const res = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  const { user } = await res.json();
  assert.equal(user.jobQuota.count, 2);
  assert.equal(user.jobQuota.cap, 5);
  assert.equal(user.jobQuota.remaining, 3);
  assert.equal(user.jobQuota.atCap, false);
  assert.equal(user.jobQuota.unlimited, false);
});
