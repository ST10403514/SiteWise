'use strict';

const { Router } = require('express');

function authRoutes({ authController, authGuard }) {
  const router = Router();
  router.post('/signup', authController.signup);
  router.post('/login', authController.login);
  router.post('/logout', authController.logout);
  router.get('/me', authGuard, authController.me);

  // Password reset (public - no auth guard)
  router.post('/forgot-password', authController.forgotPassword);
  router.post('/reset-password', authController.resetPassword);
  return router;
}

module.exports = authRoutes;