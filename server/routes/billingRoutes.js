'use strict';

const { Router } = require('express');

/** @returns {import('express').Router} */
function billingRoutes({ billingController, authGuard, requireOwner, webhookLimiter }) {
  const router = Router();
  // authGuard is applied per-route (not via router.use) because, unlike
  // every other route group in this app, this one is genuinely mixed:
  // /webhook is public by design - Paystack calls it directly, never a
  // logged-in browser - protected by signature verification inside the
  // controller instead of a session. Keeping that explicit per-route
  // avoids it ever being silently auth-gated (which would just break it)
  // or checkout/cancel silently NOT being gated (a real hole) by a future
  // reordering of these lines.
  router.post('/webhook', webhookLimiter, billingController.webhook);
  router.post('/checkout', authGuard, requireOwner, billingController.checkout);
  router.post('/cancel', authGuard, requireOwner, billingController.cancel);
  return router;
}

module.exports = billingRoutes;
