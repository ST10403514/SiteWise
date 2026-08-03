'use strict';

/**
 * SiteWise service worker.
 * Minimal by design: makes the app installable and able to launch
 * standalone, without ever caching API responses or per-user job data
 * (that must always be fresh). Static shell files are network-first with
 * a cache fallback so the app still opens if the connection drops.
 */

const CACHE = 'sitewise-shell-v1';

const SHELL = [
  '/app',
  '/jobs',
  '/css/base.css',
  '/css/app.css',
  '/js/config/IndustryPresets.js',
  '/js/services/Theme.js',
  '/js/services/ApiClient.js',
  '/js/services/SessionGuard.js',
  '/js/services/ImageTools.js',
  '/js/services/AccountMenu.js',
  '/js/models/Job.js',
  '/js/services/PdfService.js',
  '/js/pages/app.js',
  '/js/pages/jobs.js',
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