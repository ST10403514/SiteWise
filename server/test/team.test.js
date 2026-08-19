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

async function signup(email = `test-${crypto.randomUUID()}@example.com`, password = 'a-fine-password-1') {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Team Test', email, password, acceptedTerms: true }),
  });
  return { cookie: res.headers.get('set-cookie').split(';')[0], email, password };
}

async function lookupUser(email) {
  const { getClient } = require('../repositories/db');
  const config = require('../config');
  const rs = await getClient(config.db).execute({ sql: 'SELECT id, businessId FROM users WHERE email = ?', args: [email] });
  return { id: rs.rows[0].id, businessId: rs.rows[0].businessId };
}

async function inviteAndAccept(owner, email = `teammate-${crypto.randomUUID()}@example.com`) {
  await teamService.invite({ businessId: owner.businessId, invitedByUserId: owner.id, email });
  const token = new URL(capturedInviteUrl).searchParams.get('token');
  const res = await fetch(`${baseUrl}/api/auth/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, name: 'Teammate', password: 'teammate-password-1', acceptedTerms: true }),
  });
  const body = await res.json();
  return { status: res.status, cookie: res.headers.get('set-cookie')?.split(';')[0], user: body.user, email, token };
}

test('owner can invite, invitee can accept and gets a working session', async () => {
  const { email: ownerEmail } = await signup();
  const owner = await lookupUser(ownerEmail);
  const { status, user, cookie } = await inviteAndAccept(owner);
  assert.equal(status, 201);
  assert.equal(user.isOwner, false);
  assert.equal(user.onboarded, true, 'an invited teammate should never see the onboarding wizard');

  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
});

test('a non-owner gets 403 inviting or removing team members', async () => {
  const { email: ownerEmail } = await signup();
  const owner = await lookupUser(ownerEmail);
  const { cookie: teammateCookie } = await inviteAndAccept(owner);

  const inviteRes = await fetch(`${baseUrl}/api/team/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: teammateCookie },
    body: JSON.stringify({ email: `nope-${crypto.randomUUID()}@example.com` }),
  });
  assert.equal(inviteRes.status, 403);

  const removeRes = await fetch(`${baseUrl}/api/team/members/${owner.id}`, {
    method: 'DELETE', headers: { Cookie: teammateCookie },
  });
  assert.equal(removeRes.status, 403);
});

test('inviting an email that already has an account is rejected', async () => {
  const { email: ownerEmail } = await signup();
  const owner = await lookupUser(ownerEmail);
  const { email: existingEmail } = await signup();

  await assert.rejects(
    teamService.invite({ businessId: owner.businessId, invitedByUserId: owner.id, email: existingEmail }),
    /already exists/,
  );
});

test('accepting with a garbage token is rejected', async () => {
  const res = await fetch(`${baseUrl}/api/auth/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'not-a-real-token', name: 'X', password: 'whatever-password-1', acceptedTerms: true }),
  });
  assert.equal(res.status, 400);
});

test('accepting an already-accepted token a second time is rejected', async () => {
  const { email: ownerEmail } = await signup();
  const owner = await lookupUser(ownerEmail);
  const { status: firstStatus, token } = await inviteAndAccept(owner);
  assert.equal(firstStatus, 201);

  const secondAttempt = await fetch(`${baseUrl}/api/auth/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, name: 'X', password: 'whatever-password-2', acceptedTerms: true }),
  });
  assert.equal(secondAttempt.status, 400, 'a token can only ever be accepted once');
});

test('an owner cannot remove themselves', async () => {
  const { cookie: ownerCookie, email: ownerEmail } = await signup();
  const owner = await lookupUser(ownerEmail);

  const res = await fetch(`${baseUrl}/api/team/members/${owner.id}`, {
    method: 'DELETE', headers: { Cookie: ownerCookie },
  });
  assert.equal(res.status, 400);
});

test('a member leaving (DELETE /api/profile) does not touch the business\'s jobs', async () => {
  const { cookie: ownerCookie, email: ownerEmail } = await signup();
  const owner = await lookupUser(ownerEmail);
  const { cookie: teammateCookie } = await inviteAndAccept(owner);

  const jobId = crypto.randomUUID();
  await fetch(`${baseUrl}/api/jobs/${jobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
    body: JSON.stringify({ data: { quoteNumber: 'Q-1', clientName: 'Stays put' } }),
  });

  const leaveRes = await fetch(`${baseUrl}/api/profile`, { method: 'DELETE', headers: { Cookie: teammateCookie } });
  assert.equal(leaveRes.status, 200);
  const leaveBody = await leaveRes.json();
  assert.equal(leaveBody.left, true);

  const ownerGet = await fetch(`${baseUrl}/api/jobs/${jobId}`, { headers: { Cookie: ownerCookie } });
  assert.equal(ownerGet.status, 200, "the owner's job must survive a teammate leaving");

  const meAfterLeaving = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: teammateCookie } });
  assert.equal(meAfterLeaving.status, 401, "the departed teammate's own session should no longer work");
});

test('an owner with teammates present cannot delete their account outright', async () => {
  const { cookie: ownerCookie, email: ownerEmail } = await signup();
  const owner = await lookupUser(ownerEmail);
  await inviteAndAccept(owner);

  const res = await fetch(`${baseUrl}/api/profile`, { method: 'DELETE', headers: { Cookie: ownerCookie } });
  assert.equal(res.status, 400);
});

test('a sole owner (no teammates) still gets full account deletion', async () => {
  const { cookie: ownerCookie, email: ownerEmail } = await signup();
  const owner = await lookupUser(ownerEmail);

  const jobId = crypto.randomUUID();
  await fetch(`${baseUrl}/api/jobs/${jobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
    body: JSON.stringify({ data: { quoteNumber: 'Q-1', clientName: 'Deleted with the account' } }),
  });

  const res = await fetch(`${baseUrl}/api/profile`, { method: 'DELETE', headers: { Cookie: ownerCookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.left, undefined, 'a sole owner deleting is a real deletion, not a "left" event');

  const meAfter = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: ownerCookie } });
  assert.equal(meAfter.status, 401);
});
