'use strict';

const AuthService = require('../services/AuthService');
const v = require('../utils/validators');

/** Translates HTTP requests into AuthService calls and session cookies. */
class AuthController {
  constructor({ authService, tokenService, config }) {
    this._auth = authService;
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
      };
      const user = await this._auth.signup(input);
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
    res.clearCookie(this._config.cookieName);
    res.json({ ok: true });
  };

  me = (req, res) => {
    res.json({ user: AuthService.toPublic(req.user) });
  };
}

module.exports = AuthController;
