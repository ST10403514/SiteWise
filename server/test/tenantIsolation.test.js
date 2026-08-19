'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { freshApp, listen } = require('./helpers/testApp');

let baseUrl;
let close;

before(async () => {
  const { app } = await freshApp();
  ({ baseUrl, close } = await listen(app));
});

after(() => close());

async function signup() {
  const email = `test-${crypto.randomUUID()}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Tenant Test', email, password: 'a-fine-password-1', acceptedTerms: true }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

function minimalJobPayload() {
  return { data: { quoteNumber: 'Q-1', clientName: 'Owner-only client' } };
}

test('a second account cannot read, overwrite, delete, or list another account\'s job', async () => {
  const ownerCookie = await signup();
  const outsiderCookie = await signup();
  const jobId = crypto.randomUUID();

  const createRes = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
    body: JSON.stringify(minimalJobPayload()),
  });
  assert.equal(createRes.status, 200, 'owner should be able to create their own job');

  const outsiderGet = await fetch(`${baseUrl}/api/jobs/${jobId}`, { headers: { Cookie: outsiderCookie } });
  assert.equal(outsiderGet.status, 404, 'a non-owner GET should look identical to the job not existing');

  const outsiderOverwrite = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: outsiderCookie },
    body: JSON.stringify({ data: { quoteNumber: 'Q-HIJACKED', clientName: 'Attacker' } }),
  });
  assert.equal(outsiderOverwrite.status, 403, 'a non-owner overwrite of an existing job should be forbidden, not silently succeed');

  const outsiderDelete = await fetch(`${baseUrl}/api/jobs/${jobId}`, { method: 'DELETE', headers: { Cookie: outsiderCookie } });
  assert.equal(outsiderDelete.status, 404);

  const outsiderList = await fetch(`${baseUrl}/api/jobs`, { headers: { Cookie: outsiderCookie } });
  const outsiderJobs = await outsiderList.json();
  assert.equal(outsiderJobs.jobs.some((j) => j.id === jobId), false, "the outsider's own list must not include the other tenant's job");

  // The owner's own data must be completely unaffected by all of the above.
  const ownerGet = await fetch(`${baseUrl}/api/jobs/${jobId}`, { headers: { Cookie: ownerCookie } });
  assert.equal(ownerGet.status, 200);
  const ownerJob = await ownerGet.json();
  assert.equal(ownerJob.job.data.clientName, 'Owner-only client', 'the forbidden overwrite attempt must not have mutated the real data');

  const ownerList = await fetch(`${baseUrl}/api/jobs`, { headers: { Cookie: ownerCookie } });
  const ownerJobs = await ownerList.json();
  assert.equal(ownerJobs.jobs.some((j) => j.id === jobId), true, "the owner's own list should still include their job");
});
