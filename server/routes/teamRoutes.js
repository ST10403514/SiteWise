'use strict';

const { Router } = require('express');

/** @returns {import('express').Router} */
function teamRoutes({ teamController, authGuard, requireOwner, inviteLimiter }) {
  const router = Router();
  router.use(authGuard);
  router.get('/members', teamController.listMembers);
  router.post('/invite', requireOwner, inviteLimiter, teamController.invite);
  router.delete('/members/:userId', requireOwner, teamController.removeMember);
  return router;
}

module.exports = teamRoutes;
