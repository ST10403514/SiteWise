'use strict';

/**
 * Thin wrapper around fetch for the JSON API.
 * The session travels in an httpOnly cookie, so no tokens are handled here.
 */
class ApiClient {
  /** @param {string} [base] */
  constructor(base = '/api') {
    this._base = base;
  }

  async _request(method, path, body) {
    const res = await fetch(this._base + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  signup(input)  { return this._request('POST', '/auth/signup', input); }
  login(input)   { return this._request('POST', '/auth/login', input); }
  logout()       { return this._request('POST', '/auth/logout'); }
  me()           { return this._request('GET', '/auth/me'); }
  saveProfile(p) { return this._request('PUT', '/profile', p); }
  savePresets(p) { return this._request('PUT', '/profile/presets', p); }
  deleteAccount() { return this._request('DELETE', '/profile'); }
  listJobs()          { return this._request('GET', '/jobs'); }
  getJob(id)          { return this._request('GET', `/jobs/${id}`); }
  saveJob(id, data)   { return this._request('PUT', `/jobs/${id}`, { data }); }
  deleteJob(id)       { return this._request('DELETE', `/jobs/${id}`); }

  /**
   * Upload a compressed base64 image to R2 and get back its public URL.
   * @param {string} dataUrl
   * @param {string} [folder] one of photos/expenses/wages/site-photos
   * @returns {Promise<{url: string}>}
   */
  uploadPhoto(dataUrl, folder) { return this._request('POST', '/uploads', { dataUrl, folder }); }
}

window.ApiClient = ApiClient;