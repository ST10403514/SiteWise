'use strict';

/** Controls the combined sign-in / create-account page. */
class AuthPage {
  constructor() {
    this._api = new ApiClient();
    this._guard = new SessionGuard(this._api);
    this._mode = new URLSearchParams(location.search).get('mode') === 'signup'
      ? 'signup' : 'login';

    this._els = {
      title: document.getElementById('authTitle'),
      sub: document.getElementById('authSub'),
      tabLogin: document.getElementById('tabLogin'),
      tabSignup: document.getElementById('tabSignup'),
      nameField: document.getElementById('nameField'),
      name: document.getElementById('name'),
      email: document.getElementById('email'),
      password: document.getElementById('password'),
      submit: document.getElementById('submitBtn'),
      error: document.getElementById('formError'),
      form: document.getElementById('authForm'),
      termsField: document.getElementById('termsField'),
      acceptTerms: document.getElementById('acceptTerms'),
    };
  }

  async init() {
    // Already signed in? Skip straight past this page.
    const user = await this._guard.currentUser();
    if (user) return location.replace(SessionGuard.destinationFor(user));

    this._els.tabLogin.addEventListener('click', () => this._setMode('login'));
    this._els.tabSignup.addEventListener('click', () => this._setMode('signup'));
    this._els.form.addEventListener('submit', (e) => this._submit(e));
    this._setMode(this._mode);
  }

  _setMode(mode) {
    this._mode = mode;
    const signup = mode === 'signup';
    this._els.tabLogin.setAttribute('aria-selected', String(!signup));
    this._els.tabSignup.setAttribute('aria-selected', String(signup));
    this._els.nameField.hidden = !signup;
    this._els.termsField.hidden = !signup;
    if (!signup) this._els.acceptTerms.checked = false;
    this._els.title.textContent = signup ? 'Create your account' : 'Welcome back';
    this._els.sub.textContent = signup
      ? 'One account for reports, quotes and PDFs.'
      : 'Sign in to pick up where you left off.';
    this._els.submit.textContent = signup ? 'Create account' : 'Sign in';
    this._els.password.autocomplete = signup ? 'new-password' : 'current-password';
    this._showError('');
    history.replaceState(null, '', `/auth?mode=${mode}`);
  }

  _showError(message) {
    this._els.error.textContent = message;
    this._els.error.classList.toggle('show', Boolean(message));
  }

  async _submit(event) {
    event.preventDefault();
    this._showError('');
    this._els.submit.disabled = true;
    try {
      const email = this._els.email.value.trim();
      const password = this._els.password.value;
      if (this._mode === 'signup' && !this._els.acceptTerms.checked) {
        this._showError('Please accept the Terms & Conditions to create an account.');
        this._els.submit.disabled = false;
        return;
      }
      const { user } = this._mode === 'signup'
        ? await this._api.signup({ name: this._els.name.value.trim(), email, password, acceptedTerms: true })
        : await this._api.login({ email, password });
      location.replace(SessionGuard.destinationFor(user));
    } catch (err) {
      this._showError(err.message);
      this._els.submit.disabled = false;
    }
  }
}

new AuthPage().init();