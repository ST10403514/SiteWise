'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { freshApp, listen } = require('./helpers/testApp');

let baseUrl;
let close;
let teamService;
let capturedInviteUrl;

before(async () => {
  const { app } = await freshApp();
  ({ baseUrl, close } = await listen(app));

  // Same live db the HTTP server above is using - constructed directly here
  // only so the test can intercept the raw invite token, which by design
  // never travels over HTTP (only its hash is stored), same pattern as
  // passwordReset.test.js's stubbed email service for reset tokens.
  const config = require('../config');
  const UserRepository = require('../repositories/UserRepository');
  const BusinessRepository = require('../repositories/BusinessRepository');
  const InviteRepository = require('../repositories/InviteRepository');
  const TeamService = require('../services/TeamService');
  const stubEmail = {
    configured: true,
    sendInvite: async ({ inviteUrl }) => { capturedInviteUrl = inviteUrl; },
  };
  teamService = new TeamService(
    new UserRepository(config.db), new BusinessRepository(config.db), new InviteRepository(config.db),
    { emailService: stubEmail, appBaseUrl: 'http://test' },
  );
});

after(() => close());

async function signup(email = `test-${crypto.randomUUID()}@example.com`) {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Tenant Test', email, password: 'a-fine-password-1', acceptedTerms: true }),
  });
  return { cookie: res.headers.get('set-cookie').split(';')[0], email };
}

/** businessId/id aren't exposed over the API by design - looked up directly for test setup only. */
async function lookupUser(email) {
  const { getClient } = require('../repositories/db');
  const config = require('../config');
  const rs = await getClient(config.db).execute({ sql: 'SELECT id, businessId FROM users WHERE email = ?', args: [email] });
  return { id: rs.rows[0].id, businessId: rs.rows[0].businessId };
}

function minimalJobPayload() {
  return { data: { quoteNumber: 'Q-1', clientName: 'Owner-only client' } };
}

test('two DIFFERENT businesses cannot read, overwrite, delete, or list each other\'s jobs', async () => {
  const { cookie: ownerCookie } = await signup();
  const { cookie: outsiderCookie } = await signup();
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

test('two logins on the SAME business correctly share access to a job', async () => {
  const { cookie: ownerCookie, email: ownerEmail } = await signup();
  const owner = await lookupUser(ownerEmail);

  const teammateEmail = `teammate-${crypto.randomUUID()}@example.com`;
  await teamService.invite({ businessId: owner.businessId, invitedByUserId: owner.id, email: teammateEmail });
  assert.ok(capturedInviteUrl, 'expected the stub email service to capture an invite URL');
  const token = new URL(capturedInviteUrl).searchParams.get('token');

  const acceptRes = await fetch(`${baseUrl}/api/auth/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, name: 'Teammate', password: 'a-fine-password-2', acceptedTerms: true }),
  });
  assert.equal(acceptRes.status, 201);
  const { user: teammate } = await acceptRes.json();
  assert.equal(teammate.isOwner, false, 'an accepted invite must never grant ownership');
  const teammateCookie = acceptRes.headers.get('set-cookie').split(';')[0];

  const jobId = crypto.randomUUID();
  const createRes = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
    body: JSON.stringify(minimalJobPayload()),
  });
  assert.equal(createRes.status, 200);

  // The teammate is a completely different login (own email, own password,
  // own session) - this is the actual proof the businessId scoping swap
  // works, not just that it didn't reopen the cross-tenant boundary above.
  const teammateGet = await fetch(`${baseUrl}/api/jobs/${jobId}`, { headers: { Cookie: teammateCookie } });
  assert.equal(teammateGet.status, 200, "a teammate on the SAME business must be able to read the owner's job");

  const teammateUpdate = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: teammateCookie },
    body: JSON.stringify({ data: { quoteNumber: 'Q-1', clientName: 'Edited by teammate' } }),
  });
  assert.equal(teammateUpdate.status, 200);

  const teammateList = await fetch(`${baseUrl}/api/jobs`, { headers: { Cookie: teammateCookie } });
  const teammateJobs = await teammateList.json();
  assert.equal(teammateJobs.jobs.some((j) => j.id === jobId), true, "the teammate's list must include the shared job");

  const teammateDelete = await fetch(`${baseUrl}/api/jobs/${jobId}`, { method: 'DELETE', headers: { Cookie: teammateCookie } });
  assert.equal(teammateDelete.status, 200, 'a teammate can delete a job created by someone else on the same business');
});
