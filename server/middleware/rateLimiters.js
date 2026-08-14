'use strict';

const { rateLimit } = require('express-rate-limit');

/** Shared JSON error shape, matching errorHandler's { error } responses. */
function handler(message) {
  return (_req, res) => res.status(429).json({ error: message });
}

// Brute-force guard: a handful of wrong passwords is normal (typos), dozens
// from one IP in 15 minutes is not.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('Too many sign-in attempts. Please wait a few minutes and try again.'),
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

module.exports = { loginLimiter, signupLimiter, forgotPasswordLimiter };
