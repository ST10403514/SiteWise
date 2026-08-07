'use strict';
require('dotenv').config();
const createApp = require('./app');
const config = require('./config');
const { initSchema } = require('./repositories/db');

/**
 * Ensure the database schema exists before we accept any traffic, then start
 * the server. initSchema is async (libSQL), so startup is now async too.
 */
async function start() {
  await initSchema(config.db);

  // Bind to 0.0.0.0 so the app is reachable on hosting platforms (Render, etc.)
  // and on your LAN for phone testing. Locally this still serves localhost too.
  createApp().listen(config.port, '0.0.0.0', () => {
    console.log(`SiteWise running on port ${config.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start SiteWise:', err);
  process.exit(1);
});