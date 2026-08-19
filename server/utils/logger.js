'use strict';

const pino = require('pino');
const config = require('../config');

/**
 * One shared logger for the whole server. JSON lines in production (what
 * Render's log stream, or any future log aggregator, actually wants);
 * human-readable in dev via pino-pretty, which is a devDependency only -
 * production never touches it.
 */
const logger = pino({
  level: config.isProduction ? 'info' : 'debug',
  transport: config.isProduction ? undefined : { target: 'pino-pretty' },
});

module.exports = logger;
