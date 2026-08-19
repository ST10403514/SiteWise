'use strict';

const v = require('../utils/validators');

/** Managing a business's team - invite, list, remove. */
class TeamController {
  constructor({ teamService }) {
    this._team = teamService;
  }

  listMembers = async (req, res, next) => {
    try {
      res.json({ members: await this._team.listMembers({ businessId: req.user.businessId }) });
    } catch (err) { next(err); }
  };

  invite = async (req, res, next) => {
    try {
      const email = v.requireEmail(req.body?.email);
      const result = await this._team.invite({
        businessId: req.user.businessId,
        invitedByUserId: req.user.id,
        email,
      });
      res.json({ ...result, message: 'Invite sent.' });
    } catch (err) { next(err); }
  };

  removeMember = async (req, res, next) => {
    try {
      await this._team.removeMember({
        businessId: req.user.businessId,
        requestingUserId: req.user.id,
        targetUserId: req.params.userId,
      });
      res.json({ ok: true });
    } catch (err) { next(err); }
  };
}

module.exports = TeamController;
