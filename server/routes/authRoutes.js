'use strict';

const { Router } = require('express');
const {
  loginLimiter, loginAccountLimiter, signupLimiter, forgotPasswordLimiter, resetPasswordLimiter,
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
  return router;
}

module.exports = authRoutes;