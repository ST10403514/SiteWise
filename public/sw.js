'use strict';

/**
 * SiteWise service worker.
 * Minimal by design: makes the app installable and able to launch
 * standalone. Never caches API responses itself - job/project data is
 * cached separately, in IndexedDB via LocalStore/JobStore, which is what
 * actually lets the app read cached data offline. This worker's job is
 * only the static shell (HTML/CSS/JS): network-first with a cache
 * fallback, so the app still opens (with its last-cached code) if the
 * connection drops before those two services even get a chance to run.
 */

const CACHE = 'sitewise-shell-v4';

const SHELL = [
  '/app',
  '/jobs',
  '/project-manager',
  '/project-detail',
  '/onboarding',
  '/team',
  '/css/base.css',
  '/css/app.css',
  '/css/jobs.css',
  '/css/project-manager.css',
  '/css/project-detail.css',
  '/css/team.css',
  '/js/config/IndustryPresets.js',
  '/js/services/ErrorTracking.js',
  '/js/services/Theme.js',
  '/js/services/ApiClient.js',
  '/js/services/SessionGuard.js',
  '/js/services/LocalStore.js',
  '/js/services/JobStore.js',
  '/js/services/ImageTools.js',
  '/js/services/AccountMenu.js',
  '/js/models/Job.js',
  '/js/services/PdfService.js',
  '/js/pages/app.js',
  '/js/pages/jobs.js',
  '/js/pages/projectManager.js',
  '/js/pages/projectDetail.js',
  '/js/pages/onboarding.js',
  '/js/pages/team.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle same-origin GETs. Cross-origin requests (R2 images, fonts)
  // must go straight to the network so their CORS settings are preserved -
  // intercepting them breaks canvas/PDF image loading with opaque responses.
  if (new URL(request.url).origin !== self.location.origin) return;

  // Never touch API calls or non-GET requests - always go to network.
  if (request.method !== 'GET' || request.url.includes('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request)),
  );
});