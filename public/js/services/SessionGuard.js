'use strict';

/**
 * Page-level routing guard.
 * Decides where the visitor belongs based on their session state.
 *
 * Offline resilience: a failed `/api/auth/me` check used to be treated as
 * "not signed in" regardless of *why* it failed - which meant losing signal
 * logged you out of the UI even though your session cookie was still
 * perfectly valid. Now only a genuine 401 counts as logged out; a network
 * failure (or any other error) falls back to the last-known signed-in user,
 * cached in localStorage, so the app keeps working with what it already
 * has instead of bouncing to the login screen.
 */
class SessionGuard {
  static CACHE_KEY = 'sitewise_user';

  /** @param {ApiClient} api */
  constructor(api) {
    this._api = api;
  }

  /** @returns {Promise<object|null>} the signed-in user, or null */
  async currentUser() {
    try {
      const { user } = await this._api.me();
      SessionGuard._cacheUser(user);
      return user;
    } catch (err) {
      if (err.status === 401) {
        SessionGuard._clearCachedUser();
        return null;
      }
      // Network failure, 5xx, etc. - not proof the session is invalid.
      return SessionGuard._cachedUser();
    }
  }

  /** Pages that require a signed-in user (app, onboarding). */
  async requireUser() {
    const user = await this.currentUser();
    if (!user) {
      window.location.replace('/auth?mode=login');
      return null;
    }
    return user;
  }

  /** The app additionally requires completed onboarding. */
  async requireOnboardedUser() {
    const user = await this.requireUser();
    if (user && !user.onboarded) {
      window.location.replace('/onboarding');
      return null;
    }
    return user;
  }

  /** Logs out and forgets the cached session, so the offline fallback above can't resurrect it. */
  async logout() {
    SessionGuard._clearCachedUser();
    try { await this._api.logout(); } catch { /* best effort - clearing the cookie server-side is nice-to-have if offline */ }
  }

  /** Where a signed-in user should land. */
  static destinationFor(user) {
    return user.onboarded ? '/jobs' : '/onboarding';
  }

  static _cacheUser(user) {
    try { localStorage.setItem(SessionGuard.CACHE_KEY, JSON.stringify(user)); } catch { /* storage unavailable/full */ }
  }

  static _cachedUser() {
    try { return JSON.parse(localStorage.getItem(SessionGuard.CACHE_KEY) || 'null'); } catch { return null; }
  }

  static _clearCachedUser() {
    try { localStorage.removeItem(SessionGuard.CACHE_KEY); } catch { /* ignore */ }
  }
}

window.SessionGuard = SessionGuard;
