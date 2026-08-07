'use strict';

const { Router } = require('express');

/** @returns {import('express').Router} */
function uploadRoutes({ uploadController, authGuard }) {
  const router = Router();
  router.post('/', authGuard, uploadController.create);
  // Same-origin image proxy for PDF generation (GET /api/uploads/proxy?url=...)
  router.get('/proxy', authGuard, uploadController.proxy);
  return router;
}

module.exports = uploadRoutes;