'use strict';

const { Router } = require('express');

/** @returns {import('express').Router} */
function authRoutes({ authController, authGuard }) {
  const router = Router();
  router.post('/signup', authController.signup);
  router.post('/login', authController.login);
  router.post('/logout', authController.logout);
  router.get('/me', authGuard, authController.me);
  return router;
}

module.exports = authRoutes;
