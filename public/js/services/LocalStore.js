'use strict';

/**
 * LocalStore - on-device persistence for offline use, backed by IndexedDB.
 *
 * Hand-rolled rather than pulling in a wrapper library (e.g. idb): the
 * operations this app actually needs - get/put/getAll on a couple of
 * stores, no cursors or complex queries - are small enough that a
 * dependency isn't worth it, especially one that would itself need to be
 * reliably cached for offline use.
 *
 * Stores:
 *   jobList - cached dashboard summary rows (what GET /api/jobs returns)
 *   jobs    - cached full job records, keyed by id. Each record is either
 *             a confirmed server copy (pendingSync: false) or a local edit
 *             that hasn't synced yet (pendingSync: true, localUpdatedAt
 *             set) - that flag is what makes offline writes durable: they
 *             survive a reload/navigation because they're written here
 *             immediately, not just held in a page's in-memory state.
 */
class LocalStore {
  static DB_NAME = 'sitewise';
  static DB_VERSION = 1;

  static _dbPromise = null;

  static _open() {
    if (LocalStore._dbPromise) return LocalStore._dbPromise;
    LocalStore._dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(LocalStore.DB_NAME, LocalStore.DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('jobList')) db.createObjectStore('jobList', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('jobs')) db.createObjectStore('jobs', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return LocalStore._dbPromise;
  }

  /** Wraps a single IDBRequest as a promise. */
  static _reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Runs `fn(store)` inside a transaction on `storeName` and resolves once
   * the transaction actually commits (not just when the request queues) -
   * IndexedDB transactions auto-close, so waiting on oncomplete is what
   * makes writes durable before the promise resolves. `fn` may itself be
   * async and issue several sequential requests against `store` (e.g. a
   * get followed by a put) - that's safe as long as every await is on an
   * IndexedDB request within this same transaction, not on anything else.
   */
  static async _run(storeName, mode, fn) {
    const db = await LocalStore._open();
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const resultPromise = Promise.resolve(fn(store));
    return new Promise((resolve, reject) => {
      resultPromise.catch(reject);
      tx.oncomplete = () => resultPromise.then(resolve, reject);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  }

  // ── Job list (dashboard summaries) ──────────────────────────────

  /** Replaces the entire cached list with the latest server truth. */
  static async saveJobList(jobs) {
    return LocalStore._run('jobList', 'readwrite', (store) => {
      store.clear();
      jobs.forEach((job) => store.put(job));
    }).catch(() => {}); // caching is best-effort - never let it break a real request
  }

  /** @returns {Promise<object[]>} cached summary rows, newest-first order not guaranteed */
  static async getJobList() {
    try {
      return await LocalStore._run('jobList', 'readonly', (store) => LocalStore._reqToPromise(store.getAll()));
    } catch {
      return [];
    }
  }

  // ── Individual full jobs ─────────────────────────────────────────

  /**
   * Caches a confirmed-from-server copy (a successful GET, or a save that
   * just synced). Never overwrites a pending local edit that hasn't synced
   * yet - the server's copy is, by definition, older than an unsynced
   * local change, so clobbering it here would silently discard real work.
   */
  static async saveJob(id, data, updatedAt) {
    return LocalStore._run('jobs', 'readwrite', async (store) => {
      const existing = await LocalStore._reqToPromise(store.get(id));
      if (existing && existing.pendingSync) return;
      store.put({ id, data, updatedAt: updatedAt || new Date().toISOString(), pendingSync: false });
    }).catch(() => {});
  }

  /**
   * Records a local edit as pending sync. Called on every autosave tick
   * (and again just before the page unloads) so an edit is durable the
   * moment it's made, regardless of whether the network is reachable or
   * the page survives long enough to sync it.
   */
  static async saveLocalEdit(id, data) {
    return LocalStore._run('jobs', 'readwrite', async (store) => {
      const existing = await LocalStore._reqToPromise(store.get(id));
      store.put({
        id,
        data,
        updatedAt: existing ? existing.updatedAt : null, // last known server state, if any
        localUpdatedAt: new Date().toISOString(),
        pendingSync: true,
      });
    }).catch(() => {});
  }

  /** Clears the pending flag once a local edit has been confirmed synced. */
  static async markSynced(id, serverUpdatedAt) {
    return LocalStore._run('jobs', 'readwrite', async (store) => {
      const existing = await LocalStore._reqToPromise(store.get(id));
      if (!existing) return;
      store.put({ ...existing, updatedAt: serverUpdatedAt, pendingSync: false });
    }).catch(() => {});
  }

  /** @returns {Promise<{id: string, data: object, updatedAt: string|null}|null>} */
  static async getJob(id) {
    try {
      const record = await LocalStore._run('jobs', 'readonly', (store) => LocalStore._reqToPromise(store.get(id)));
      return record || null;
    } catch {
      return null;
    }
  }

  /** @returns {Promise<object[]>} every job with unsynced local changes */
  static async getPendingJobs() {
    try {
      const all = await LocalStore._run('jobs', 'readonly', (store) => LocalStore._reqToPromise(store.getAll()));
      return all.filter((record) => record.pendingSync);
    } catch {
      return [];
    }
  }

  static async deleteJob(id) {
    return LocalStore._run('jobs', 'readwrite', (store) => store.delete(id)).catch(() => {});
  }
}

window.LocalStore = LocalStore;
