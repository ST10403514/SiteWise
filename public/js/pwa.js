'use strict';

/**
 * PWA bootstrap - registers the service worker and manages the custom
 * "Install SiteWise" button on the jobs dashboard.
 *
 * The button appears only when the browser reports the app is installable
 * AND the user hasn't already installed or dismissed it on this device.
 * A small dismiss "x" guarantees the user can always make it go away, even
 * on localhost where the browser's install events are unreliable.
 */
(function () {
  var FLAG = 'sitewise_pwa_installed';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  var btn = document.getElementById('installBtn');
  if (!btn) return;
  btn.hidden = true;

  function isDone() {
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.navigator.standalone === true) return true;
      if (localStorage.getItem(FLAG) === '1') return true;
    } catch (e) {}
    return false;
  }

  function remember() {
    try { localStorage.setItem(FLAG, '1'); } catch (e) {}
  }

  // If we're viewing as the installed app, record it for future tabs.
  try {
    if (window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true) {
      remember();
    }
  } catch (e) {}

  // Already installed or dismissed? Stay hidden.
  if (isDone()) { btn.hidden = true; return; }

  // Add a dismiss "x" to the button (once), so it can always be closed.
  if (!btn.querySelector('.pwa-dismiss')) {
    var x = document.createElement('span');
    x.className = 'pwa-dismiss';
    x.textContent = '\u00d7';           // ×
    x.title = 'Hide this';
    x.setAttribute('role', 'button');
    x.setAttribute('aria-label', 'Hide install button');
    x.addEventListener('click', function (ev) {
      ev.stopPropagation();
      remember();                        // treat dismiss as "don't show again"
      btn.hidden = true;
    });
    btn.appendChild(x);
  }

  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    if (isDone()) return;
    deferredPrompt = e;
    btn.hidden = false;
  });

  btn.addEventListener('click', function (e) {
    // Clicks on the dismiss x are handled separately.
    if (e.target && e.target.classList && e.target.classList.contains('pwa-dismiss')) return;
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (choice) {
      if (choice && choice.outcome === 'accepted') remember();
      deferredPrompt = null;
      btn.hidden = true;
    });
  });

  window.addEventListener('appinstalled', function () {
    remember();
    btn.hidden = true;
  });
})();