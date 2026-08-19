'use strict';

const AuthService = require('../services/AuthService');
const v = require('../utils/validators');

class AuthController {
  constructor({ authService, teamService, tokenService, config }) {
    this._auth = authService;
    this._team = teamService;
    this._tokens = tokenService;
    this._config = config;
  }

  _setSession(res, user) {
    res.cookie(this._config.cookieName, this._tokens.issue(user), {
      httpOnly: true,
      sameSite: 'lax',
      secure: this._config.isProduction,
      maxAge: this._config.cookieMaxAgeMs,
    });
  }

  signup = async (req, res, next) => {
    try {
      const input = {
        name: v.requireString(req.body?.name, 'Name', { max: 100 }),
        email: v.requireEmail(req.body?.email),
        password: v.requirePassword(req.body?.password),
        acceptedTerms: req.body?.acceptedTerms === true,
      };
      const user = await this._auth.signup(input);
      this._setSession(res, user);
      res.status(201).json({ user: AuthService.toPublic(user) });
    } catch (err) { next(err); }
  };

  // Accepting a team invite is another way to create a session - reuses
  // _setSession directly rather than duplicating cookie logic, same as
  // signup/login. Business logic (token validation, user creation) lives
  // in TeamService.acceptInvite.
  acceptInvite = async (req, res, next) => {
    try {
      const input = {
        token: v.requireString(req.body?.token, 'Invite token', { max: 200 }),
        name: v.requireString(req.body?.name, 'Name', { max: 100 }),
        password: v.requirePassword(req.body?.password),
        acceptedTerms: req.body?.acceptedTerms === true,
      };
      const user = await this._team.acceptInvite(input);
      this._setSession(res, user);
      res.status(201).json({ user: AuthService.toPublic(user) });
    } catch (err) { next(err); }
  };

  login = async (req, res, next) => {
    try {
      const input = {
        email: v.requireEmail(req.body?.email),
        password: v.requireString(req.body?.password, 'Password', { max: 128 }),
      };
      const user = await this._auth.login(input);
      this._setSession(res, user);
      res.json({ user: AuthService.toPublic(user) });
    } catch (err) { next(err); }
  };

  logout = (_req, res) => {
    // clearCookie must be called with the same attributes the cookie was set
    // with (sameSite/secure), or some browsers won't actually clear it.
    res.clearCookie(this._config.cookieName, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this._config.isProduction,
    });
    res.json({ ok: true });
  };

  me = (req, res) => {
    res.json({ user: AuthService.toPublic(req.user) });
  };

  // Always returns a generic success, even if the email doesn't exist, so the
  // endpoint can't be used to discover which emails have accounts.
  forgotPassword = async (req, res, next) => {
    try {
      const email = v.requireEmail(req.body?.email);
      await this._auth.requestPasswordReset({ email });
      res.json({ ok: true, message: 'If an account exists for that email, a reset link is on its way.' });
    } catch (err) { next(err); }
  };

  resetPassword = async (req, res, next) => {
    try {
      const token = v.requireString(req.body?.token, 'Token', { max: 200 });
      const password = v.requirePassword(req.body?.password);
      await this._auth.resetPassword({ token, password });
      res.json({ ok: true, message: 'Your password has been reset. You can now sign in.' });
    } catch (err) { next(err); }
  };
}

module.exports = AuthController;