'use strict';

/**
 * AccountMenu - wires up the avatar dropdown in the app header.
 * Populates the avatar, name and email from the tenant's profile,
 * and handles open/close (click, outside-click, Escape).
 *
 * The menu's action buttons keep the ids the page controllers already
 * bind to (editProfile, logout), so behaviour lives with each page.
 */
class AccountMenu {
  /**
   * @param {object} user  signed-in user ({ name, email, profile })
   */
  static mount(user) {
    const root = document.getElementById('acct');
    if (!root) return;

    const profile = user.profile || {};
    const company = profile.companyName || 'Your business';

    // Avatar: logo if present, else company initial
    const avatar = document.getElementById('acctAvatar');
    if (profile.logo) {
      avatar.innerHTML = `<img src="${profile.logo}" alt="">`;
    } else {
      avatar.textContent = company.trim()[0].toUpperCase();
    }

    // Button label + menu header
    const nameEl = document.getElementById('acctName');
    if (nameEl) nameEl.textContent = company;
    const headNm = document.getElementById('acctHeadName');
    if (headNm) headNm.textContent = company;
    const headEm = document.getElementById('acctHeadEmail');
    if (headEm) headEm.textContent = user.email || '';

    // Team management is an owner-only concern - the API enforces this
    // independently either way, this just avoids offering a link that
    // would 403 for anyone else. Inserted here (not hardcoded per page)
    // since only mount() knows whether the signed-in user is the owner.
    if (user.isOwner) {
      const menu = root.querySelector('.acct-menu');
      const sep = root.querySelector('.acct-sep');
      if (menu && sep && !menu.querySelector('[data-team-link]')) {
        const teamLink = document.createElement('a');
        teamLink.className = 'acct-item';
        teamLink.href = '/team';
        teamLink.setAttribute('role', 'menuitem');
        teamLink.setAttribute('data-team-link', '');
        teamLink.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
          + 'stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>'
          + '<circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Team';
        sep.before(teamLink);
      }
    }

    const btn = document.getElementById('acctBtn');
    const close = () => {
      root.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    };
    const toggle = (e) => {
      e.stopPropagation();
      const open = root.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    };

    btn.addEventListener('click', toggle);
    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }
}

window.AccountMenu = AccountMenu;