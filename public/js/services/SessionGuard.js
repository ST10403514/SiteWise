'use strict';

/**
 * Page-level routing guard.
 * Decides where the visitor belongs based on their session state.
 */
class SessionGuard {
  /** @param {ApiClient} api */
  constructor(api) {
    this._api = api;
  }

  /** @returns {Promise<object|null>} the signed-in user, or null */
  async currentUser() {
    try {
      const { user } = await this._api.me();
      return user;
    } catch {
      return null;
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

  /** Where a signed-in user should land. */
  static destinationFor(user) {
    return user.onboarded ? '/jobs' : '/onboarding';
  }
}

window.SessionGuard = SessionGuard;
