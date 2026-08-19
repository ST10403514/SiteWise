'use strict';

const Sentry = require('@sentry/node');
const config = require('./config');

/**
 * Must be required before anything else in index.js so Sentry's process-wide
 * uncaughtException/unhandledRejection hooks are registered as early as
 * possible. A no-op when SENTRY_DSN_SERVER isn't set - Sentry.captureException
 * calls elsewhere stay safe either way, they just have nothing to send to.
 */
if (config.sentryConfigured) {
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.isProduction ? 'production' : 'development',
    // Errors only - no performance/trace data, to stay well inside the free
    // tier's shared event quota rather than spend it on tracing.
    tracesSampleRate: 0,
  });
}

module.exports = Sentry;
