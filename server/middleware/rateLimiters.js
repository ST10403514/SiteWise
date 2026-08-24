'use strict';

const { rateLimit } = require('express-rate-limit');

/** Shared JSON error shape, matching errorHandler's { error } responses. */
function handler(message) {
  return (_req, res) => res.status(429).json({ error: message });
}

// Automated tests legitimately need to sign up/log in far more often, in
// far less wall-clock time, than these limits assume any real user would -
// enforcing them there would make the test suite flaky on request volume,
// not on anything actually worth catching. Production behavior is untouched.
const skipInTest = () => process.env.NODE_ENV === 'test';

// Brute-force guard: a handful of wrong passwords is normal (typos), dozens
// from one IP in 5 minutes is not.
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: handler('Too many sign-in attempts. Please wait 5 minutes and try again.'),
});

// Credential-stuffing guard: the IP limiter above stops one attacker from
// hammering many accounts, but not a distributed attack spreading attempts
// across many IPs at ONE target account. This one keys on the submitted
// email instead of the caller's address, so it catches that case too.
const loginAccountLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  keyGenerator: (req) => String(req.body?.email || '').trim().toLowerCase() || 'unknown',
  handler: handler('Too many sign-in attempts for this account. Please wait 5 minutes and try again.'),
});

// Abuse guard: stop one IP from mass-creating accounts.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: handler('Too many accounts created from this connection. Please try again later.'),
});

// Stop one IP from email-bombing an address via repeated reset requests.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: handler('Too many reset requests. Please wait a while and try again.'),
});

// Reset tokens are 256 bits of randomness, so brute-forcing one is
// computationally infeasible regardless - this is defense-in-depth, not
// the thing actually stopping that attack.
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: handler('Too many attempts. Please wait a while and try again.'),
});

// Stop a compromised/malicious owner account from spamming invite emails.
const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: handler('Too many invites sent. Please wait a while and try again.'),
});

// Same shape as resetPasswordLimiter - invite tokens are 256 bits of
// randomness, brute-forcing one is infeasible regardless; this is
// defense-in-depth on a public, token-based endpoint, not the real defense.
const acceptInviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: handler('Too many attempts. Please wait a while and try again.'),
});

// Public, unauthenticated endpoint by necessity (Paystack calls it, not a
// logged-in browser) - signature verification inside the controller is the
// real gate; this is just defense in depth against wasting compute on
// abuse, generous enough that real Paystack traffic never gets near it.
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: handler('Too many requests.'),
});

module.exports = {
  loginLimiter, loginAccountLimiter, signupLimiter, forgotPasswordLimiter, resetPasswordLimiter,
  inviteLimiter, acceptInviteLimiter, webhookLimiter,
};
