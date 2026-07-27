'use strict';

const createApp = require('./app');
const config = require('./config');

createApp().listen(config.port, () => {
  console.log(`SiteWise running at http://localhost:${config.port}`);
});
