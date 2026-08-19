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

function uniqueEmail() {
  return `test-${crypto.randomUUID()}@example.com`;
}

function signupBody(overrides = {}) {
  return {
    name: 'Test User',
    email: uniqueEmail(),
    password: 'correct-horse-battery-staple',
    acceptedTerms: true,
    ...overrides,
  };
}

test('signup succeeds and returns the created user', async () => {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signupBody({ name: 'Alice' })),
  });
  assert.equal(res.status, 201);
  assert.ok(res.headers.get('set-cookie'), 'expected a session cookie to be set');
  const { user } = await res.json();
  assert.equal(user.name, 'Alice');
  assert.equal(user.onboarded, false);
});

test('signup with a duplicate email is rejected', async () => {
  const body = signupBody();
  await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(res.status, 409);
});

test('signup without accepting terms is rejected', async () => {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signupBody({ acceptedTerms: false })),
  });
  assert.equal(res.status, 400);
});

test('login with the correct password succeeds', async () => {
  const email = uniqueEmail();
  const password = 'correct-horse-battery-staple';
  await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signupBody({ email, password })),
  });
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200);
  assert.ok(res.headers.get('set-cookie'));
});

test('login with the wrong password is rejected', async () => {
  const email = uniqueEmail();
  await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signupBody({ email })),
  });
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'wrong-password-entirely' }),
  });
  assert.equal(res.status, 401);
});

test('login with an email that has no account is rejected the same way as a wrong password', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: uniqueEmail(), password: 'whatever-password' }),
  });
  assert.equal(res.status, 401);
});

test('GET /api/auth/me without a session cookie is rejected', async () => {
  const res = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(res.status, 401);
});

test('GET /api/auth/me with a valid session cookie returns that user', async () => {
  const email = uniqueEmail();
  const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signupBody({ email, name: 'Cookie Carrier' })),
  });
  const cookie = signupRes.headers.get('set-cookie').split(';')[0];

  const res = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.equal(user.email, email);
  assert.equal(user.name, 'Cookie Carrier');
});
