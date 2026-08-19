'use strict';

const { Router } = require('express');
const {
  loginLimiter, loginAccountLimiter, signupLimiter, forgotPasswordLimiter, resetPasswordLimiter,
  acceptInviteLimiter,
} = require('../middleware/rateLimiters');

function authRoutes({ authController, authGuard }) {
  const router = Router();
  router.post('/signup', signupLimiter, authController.signup);
  router.post('/login', loginLimiter, loginAccountLimiter, authController.login);
  router.post('/logout', authController.logout);
  router.get('/me', authGuard, authController.me);

  // Password reset (public - no auth guard)
  router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
  router.post('/reset-password', resetPasswordLimiter, authController.resetPassword);

  // Accepting a team invite is another way to create a session (like
  // signup), so it lives here rather than on TeamController - public, no
  // auth guard, token-based like reset-password.
  router.post('/accept-invite', acceptInviteLimiter, authController.acceptInvite);
  return router;
}

module.exports = authRoutes;