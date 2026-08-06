'use strict';

/**
 * PWA bootstrap - registers the service worker and manages install prompts.
 *
 * Two paths, because the platforms differ fundamentally:
 *   - Android / Chrome: the browser fires `beforeinstallprompt`. We catch it
 *     and show the #installBtn, which triggers the real one-tap install.
 *   - iOS / Safari: Apple does NOT support beforeinstallprompt. There is no
 *     programmatic install on iPhone at all. The only way is Share -> "Add to
 *     Home Screen". So on iOS we show a small guided banner telling the user
 *     exactly how, once per device (until they add it or dismiss it).
 *
 * In both cases nothing shows if the app is already installed / running
 * standalone, or if the user previously dismissed it.
 */
(function () {
  var FLAG = 'sitewise_pwa_installed';
  var IOS_FLAG = 'sitewise_ios_hint_dismissed';

  // ---- register the service worker ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  // ---- shared helpers ----
  function isStandalone() {
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.navigator.standalone === true) return true; // iOS installed flag
    } catch (e) {}
    return false;
  }
  function isDone() {
    try {
      if (isStandalone()) return true;
      if (localStorage.getItem(FLAG) === '1') return true;
    } catch (e) {}
    return false;
  }
  function remember() { try { localStorage.setItem(FLAG, '1'); } catch (e) {} }

  // If we're running as the installed app, record it for future browser tabs.
  if (isStandalone()) remember();

  // ---- detect iOS Safari ----
  function isIos() {
    var ua = window.navigator.userAgent || '';
    // iPhone/iPad/iPod, and iPadOS which reports as Mac but has touch
    var iDevice = /iPhone|iPad|iPod/.test(ua);
    var iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return iDevice || iPadOs;
  }
  function isInStandaloneAlready() { return isStandalone(); }

  // =========================================================
  //  iOS PATH - guided "Add to Home Screen" banner
  // =========================================================
  function setupIosBanner() {
    if (isInStandaloneAlready()) return;               // already installed
    try { if (localStorage.getItem(IOS_FLAG) === '1') return; } catch (e) {}

    // Build the banner element (no dependency on page markup).
    var bar = document.createElement('div');
    bar.className = 'pwa-ios-hint';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Install SiteWise');
    bar.innerHTML =
      '<div class="pwa-ios-inner">' +
        '<div class="pwa-ios-icon">' +
          '<img src="/assets/icons/apple-touch-icon.png" alt="" width="40" height="40" />' +
        '</div>' +
        '<div class="pwa-ios-text">' +
          '<strong>Add SiteWise to your home screen</strong>' +
          '<span>Tap the <span class="pwa-ios-nowrap"><svg class="pwa-ios-share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l4 4M12 3L8 7M12 3v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 12H5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>&nbsp;<b>Share</b></span> button, then <b>Add&nbsp;to&nbsp;Home&nbsp;Screen</b></span>' +
        '</div>' +
        '<button class="pwa-ios-close" type="button" aria-label="Dismiss">&times;</button>' +
      '</div>' +
      '<div class="pwa-ios-arrow" aria-hidden="true"></div>';

    document.body.appendChild(bar);

    bar.querySelector('.pwa-ios-close').addEventListener('click', function () {
      try { localStorage.setItem(IOS_FLAG, '1'); } catch (e) {}
      bar.classList.remove('show');
      setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 250);
    });

    // slight delay so it animates in after the page settles
    setTimeout(function () { bar.classList.add('show'); }, 600);
  }

  // =========================================================
  //  ANDROID / CHROME PATH - real install button
  // =========================================================
  function setupAndroidButton() {
    var btn = document.getElementById('installBtn');
    if (!btn) return;
    btn.hidden = true;
    if (isDone()) { btn.hidden = true; return; }

    // dismiss "x" so it can always be closed
    if (!btn.querySelector('.pwa-dismiss')) {
      var x = document.createElement('span');
      x.className = 'pwa-dismiss';
      x.textContent = '\u00d7';
      x.title = 'Hide this';
      x.setAttribute('role', 'button');
      x.setAttribute('aria-label', 'Hide install button');
      x.addEventListener('click', function (ev) {
        ev.stopPropagation();
        remember();
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
  }

  // ---- choose the path for this device ----
  if (isDone()) return;                 // already installed anywhere - do nothing

  if (isIos()) {
    // wait for DOM so we can append the banner
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupIosBanner);
    } else {
      setupIosBanner();
    }
  } else {
    setupAndroidButton();
  }
})();