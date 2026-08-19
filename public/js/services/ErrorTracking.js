'use strict';

/**
 * Sentry browser wiring, loaded as early as possible on every page. Skipped
 * entirely on localhost so local development never spends the free-tier
 * event quota. The DSN below is a public identifier, not a secret - the
 * browser SDK necessarily ships it to every visitor, same as any client-side
 * analytics key.
 */
(function () {
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;

  const script = document.createElement('script');
  script.src = 'https://browser.sentry-cdn.com/10.70.0/bundle.min.js';
  script.crossOrigin = 'anonymous';
  script.onload = function () {
    window.Sentry.init({
      dsn: 'https://2a79077474006b588e58b77607db7771@o4511936136544256.ingest.de.sentry.io/4511936148209744',
      environment: 'production',
      tracesSampleRate: 0,
    });
  };
  document.head.appendChild(script);
})();
