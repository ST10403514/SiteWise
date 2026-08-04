'use strict';

/**
 * Theme - applies a tenant's colour scheme to the page by overriding
 * the CSS custom properties every stylesheet is written against.
 * (--navy/--blue read as "primary/accent" roles.)
 *
 * To avoid a flash of the default scheme on load, apply() also caches the
 * resolved colours in localStorage. A small inline script in the <head>
 * of app.html / jobs.html reads that cache and paints the correct colours
 * before the body renders, so there is no visible swap.
 */
class Theme {
  /** @param {string} schemeKey key into IndustryPresets.colorSchemes */
  static apply(schemeKey) {
    const s = IndustryPresets.scheme(schemeKey);
    const vars = {
      '--navy': s.primary,
      '--navy-deep': s.primaryDeep,
      '--blue': s.accent,
      '--blue-ink': s.accentInk,
      '--blue-mist': s.accentMist,
      '--blue-line': s.accentLine,
    };
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);

    // Cache the resolved colours so the next page load can paint them
    // instantly, before any network call, avoiding the default-scheme flash.
    try {
      localStorage.setItem('sitewise_theme', JSON.stringify(vars));
    } catch (_) { /* storage unavailable - not critical */ }
  }

  /** @returns {[number, number, number]} '#rrggbb' -> RGB triplet */
  static rgb(hex) {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
}

window.Theme = Theme;