'use strict';

/**
 * Theme - applies a tenant's colour scheme to the page by overriding
 * the CSS custom properties every stylesheet is written against.
 * (--navy/--blue read as "primary/accent" roles.)
 */
class Theme {
  /** @param {string} schemeKey key into IndustryPresets.colorSchemes */
  static apply(schemeKey) {
    const s = IndustryPresets.scheme(schemeKey);
    const root = document.documentElement.style;
    root.setProperty('--navy', s.primary);
    root.setProperty('--navy-deep', s.primaryDeep);
    root.setProperty('--blue', s.accent);
    root.setProperty('--blue-ink', s.accentInk);
    root.setProperty('--blue-mist', s.accentMist);
    root.setProperty('--blue-line', s.accentLine);
  }

  /** @returns {[number, number, number]} '#rrggbb' → RGB triplet */
  static rgb(hex) {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
}

window.Theme = Theme;
