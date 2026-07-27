'use strict';

const { Router } = require('express');

/** @returns {import('express').Router} */
function jobRoutes({ jobController, authGuard }) {
  const router = Router();
  router.use(authGuard);
  router.get('/', jobController.list);
  router.get('/:id', jobController.get);
  router.put('/:id', jobController.save);
  router.delete('/:id', jobController.remove);
  return router;
}

module.exports = jobRoutes;
