'use strict';

const { Router } = require('express');

/** @returns {import('express').Router} */
function profileRoutes({ profileController, authGuard }) {
  const router = Router();
  router.put('/', authGuard, profileController.update);
  router.put('/presets', authGuard, profileController.updatePresets);
  router.delete('/', authGuard, profileController.deleteAccount);
  return router;
}

module.exports = profileRoutes;