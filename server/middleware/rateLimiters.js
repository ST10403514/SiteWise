'use strict';

const { rateLimit } = require('express-rate-limit');

/** Shared JSON error shape, matching errorHandler's { error } responses. */
function handler(message) {
  return (_req, res) => res.status(429).json({ error: message });
}

// Brute-force guard: a handful of wrong passwords is normal (typos), dozens
// from one IP in 5 minutes is not.
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
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
  keyGenerator: (req) => String(req.body?.email || '').trim().toLowerCase() || 'unknown',
  handler: handler('Too many sign-in attempts for this account. Please wait 5 minutes and try again.'),
});

// Abuse guard: stop one IP from mass-creating accounts.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('Too many accounts created from this connection. Please try again later.'),
});

// Stop one IP from email-bombing an address via repeated reset requests.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
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
  handler: handler('Too many attempts. Please wait a while and try again.'),
});

module.exports = { loginLimiter, loginAccountLimiter, signupLimiter, forgotPasswordLimiter, resetPasswordLimiter };
