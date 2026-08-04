'use strict';

const createApp = require('./app');
const config = require('./config');

// Bind to 0.0.0.0 so the app is reachable on hosting platforms (Render, etc.)
// and on your LAN for phone testing. Locally this still serves localhost too.
createApp().listen(config.port, '0.0.0.0', () => {
  console.log(`SiteWise running on port ${config.port}`);
});