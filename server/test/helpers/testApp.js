'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SERVER_ROOT = path.join(__dirname, '..', '..');

/**
 * Clears every cached module under server/ (not node_modules) so config.js -
 * a singleton that reads process.env once, at first require - re-reads the
 * fresh env vars set below instead of reusing whatever an earlier test file
 * (or the dev server, if this ever ran in-process with it) already resolved.
 */
function resetServerModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(SERVER_ROOT) && !key.includes(`${path.sep}node_modules${path.sep}`)) {
      delete require.cache[key];
    }
  }
}

/**
 * Builds a fully-wired app against a fresh, disposable local SQLite database -
 * real integration, not mocks, same as how the rest of this app has been
 * verified all along. Each call gets its own temp DATA_DIR, so tests never
 * touch the real dev database and can't interfere with each other.
 * @returns {Promise<{app: import('express').Express, dataDir: string}>}
 */
async function freshApp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitewise-test-'));
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  delete process.env.TURSO_URL; // force the local-file fallback, never the real Turso db

  resetServerModuleCache();

  const config = require('../../config');
  const { initSchema } = require('../../repositories/db');
  const createApp = require('../../app');

  await initSchema(config.db);
  return { app: createApp(), dataDir };
}

/** Starts `app` on an ephemeral port and returns its base URL + a closer. */
function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res)),
      });
    });
    server.on('error', reject);
  });
}

/** Pulls just the cookie's name=value part out of a raw Set-Cookie header. */
function sessionCookieFrom(setCookieHeader) {
  return setCookieHeader.split(';')[0];
}

module.exports = { freshApp, listen, sessionCookieFrom };
