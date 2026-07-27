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