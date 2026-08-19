'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { freshApp, listen } = require('./helpers/testApp');

let baseUrl;
let close;
let authService;
let capturedResetUrl;

before(async () => {
  const { app } = await freshApp();
  ({ baseUrl, close } = await listen(app));

  // Same live db the HTTP server above is using (freshApp already set it up) -
  // constructed directly here only so the test can intercept the raw reset
  // token, which by design never travels over HTTP (only its hash is stored;
  // the raw value only ever exists on its way to the email service).
  const config = require('../config');
  const UserRepository = require('../repositories/UserRepository');
  const BusinessRepository = require('../repositories/BusinessRepository');
  const AuthService = require('../services/AuthService');
  const stubEmail = {
    configured: true,
    sendPasswordReset: async ({ resetUrl }) => { capturedResetUrl = resetUrl; },
  };
  authService = new AuthService(
    new UserRepository(config.db), new BusinessRepository(config.db),
    { emailService: stubEmail, appBaseUrl: 'http://test' },
  );
});

after(() => close());

function uniqueEmail() {
  return `test-${crypto.randomUUID()}@example.com`;
}

async function signup(email, password) {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Reset Test', email, password, acceptedTerms: true }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

async function login(email, password) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
}

test('requesting a reset for an account that does not exist still reports success (no enumeration)', async () => {
  const res = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: uniqueEmail() }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test('reset-password with a garbage token is rejected', async () => {
  const res = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'not-a-real-token', password: 'new-password-123' }),
  });
  assert.equal(res.status, 400);
});

test('a completed reset changes the password and invalidates any session issued before it', async () => {
  const email = uniqueEmail();
  const oldPassword = 'original-password-123';
  const newPassword = 'brand-new-password-456';

  const oldCookie = await signup(email, oldPassword);

  // JWT `iat` only has 1-second resolution, and requireAuth rejects a token
  // only if its iat is strictly BEFORE passwordChangedAt's floored second -
  // without this gap, a reset in the same wall-clock second as signup could
  // land on the same second and the old cookie would (correctly, per that
  // rule) still pass, making the test flaky rather than the code wrong.
  await new Promise((resolve) => setTimeout(resolve, 1100));

  await authService.requestPasswordReset({ email });
  assert.ok(capturedResetUrl, 'expected the stub email service to capture a reset URL');
  const token = new URL(capturedResetUrl).searchParams.get('token');

  await authService.resetPassword({ token, password: newPassword });

  const oldLoginRes = await login(email, oldPassword);
  assert.equal(oldLoginRes.status, 401);

  const newLoginRes = await login(email, newPassword);
  assert.equal(newLoginRes.status, 200);

  const meWithOldCookie = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: oldCookie } });
  assert.equal(meWithOldCookie.status, 401, 'a session issued before the reset should no longer be valid');
});
