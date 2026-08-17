'use strict';

/**
 * JobStore - the single place every page goes for job data. Local-first:
 * reads prefer a pending (unsynced) local edit over the network, and every
 * save is written to IndexedDB before a sync is even attempted - so an
 * edit survives a reload, a closed tab, or lost signal, not just staying
 * on the same page.
 *
 * Conflict handling is record-level last-write-wins: on reconnect, each
 * pending job is pushed as-is via the existing PUT /api/jobs/:id, which
 * already just overwrites. Deliberately not per-field merging - see the
 * design discussion this was scoped from: for a single tradie, the same
 * job being edited concurrently on two devices in the same offline window
 * is rare enough that the simpler model is worth it.
 */
class JobStore {
  static SYNC_INTERVAL_MS = 30_000;

  /** @param {ApiClient} api */
  constructor(api) {
    this._api = api;
    this._syncing = false;
    this.syncPending().catch(() => {});
    window.addEventListener('online', () => this.syncPending().catch(() => {}));
    // Belt-and-braces beyond the 'online' event: a connection can be
    // flaky (browser thinks it's online, requests still fail) without
    // ever firing a fresh 'online' event.
    setInterval(() => this.syncPending().catch(() => {}), JobStore.SYNC_INTERVAL_MS);
  }

  /** True for a network failure (fetch itself never got a response) - ApiClient only sets .status on a real HTTP response. */
  static _isNetworkError(err) {
    return !err || err.status === undefined;
  }

  /** @returns {Promise<{jobs: object[], offline: boolean}>} */
  async listJobs() {
    try {
      const { jobs } = await this._api.listJobs();
      LocalStore.saveJobList(jobs);
      return { jobs, offline: false };
    } catch (err) {
      if (!JobStore._isNetworkError(err)) throw err;
      const jobs = await LocalStore.getJobList();
      return { jobs, offline: true };
    }
  }

  /** @returns {Promise<{job: {id: string, data: object, updatedAt: string|null}, offline: boolean, pending: boolean}>} */
  async getJob(id) {
    const cached = await LocalStore.getJob(id);
    if (cached && cached.pendingSync) {
      // Unsynced local changes exist - that's the source of truth until
      // they sync, regardless of what the network has (which is, by
      // definition, older).
      return { job: cached, offline: false, pending: true };
    }
    try {
      const { job } = await this._api.getJob(id);
      LocalStore.saveJob(job.id, job.data, job.updatedAt);
      return { job, offline: false, pending: false };
    } catch (err) {
      if (!JobStore._isNetworkError(err)) throw err;
      if (cached) return { job: cached, offline: true, pending: false };
      throw err;
    }
  }

  /**
   * Writes the edit to IndexedDB first (durable regardless of network),
   * then attempts to sync it. A network failure here is NOT an error from
   * the caller's point of view - the edit is safe, it's just waiting to
   * sync - only a genuine server error (bad data, auth) is rethrown.
   * @returns {Promise<{offline: boolean}>}
   */
  async saveJob(id, data) {
    await LocalStore.saveLocalEdit(id, data);
    try {
      const { job } = await this._api.saveJob(id, data);
      await LocalStore.markSynced(id, job.updatedAt);
      return { offline: false };
    } catch (err) {
      if (!JobStore._isNetworkError(err)) throw err;
      return { offline: true };
    }
  }

  /** Pushes every locally-pending job to the server. Safe to call anytime - a no-op if nothing is pending. */
  async syncPending() {
    if (this._syncing) return;
    this._syncing = true;
    try {
      const pending = await LocalStore.getPendingJobs();
      for (const record of pending) {
        try {
          const { job } = await this._api.saveJob(record.id, record.data);
          await LocalStore.markSynced(record.id, job.updatedAt);
        } catch (err) {
          if (!JobStore._isNetworkError(err)) {
            // A real error (validation, auth) - retrying forever won't fix
            // it, but leaving it pending (rather than silently dropping
            // it) at least keeps the data recoverable and visible as stuck.
            console.error('SiteWise: failed to sync job', record.id, err);
          }
          // Network error - still offline, leave pending, try again later.
        }
      }
    } finally {
      this._syncing = false;
    }
  }
}

window.JobStore = JobStore;
