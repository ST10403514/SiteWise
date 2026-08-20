'use strict';

/**
 * AccountMenu - wires up the avatar dropdown in every app header.
 *
 * The full nav list (Job cards / Project manager / Company details /
 * Team / Sign out) is built here, once, so every page shows the exact
 * same items in the exact same order. Previously each page's static HTML
 * hand-copied its own version of this list, and they drifted apart over
 * time - different labels for the same destination, different icons,
 * reversed order, one page missing the menu entirely. Each page's HTML
 * now only needs the outer shell (.acct/.acct-btn/.acct-menu with just
 * .acct-head inside) - everything below that is appended here.
 */
class AccountMenu {
  static NAV_ITEMS = [
    {
      href: '/jobs', label: 'Job cards', activePaths: ['/jobs', '/app'],
      icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>',
    },
    {
      href: '/project-manager', label: 'Project manager', activePaths: ['/project-manager', '/project-detail'],
      icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    },
    {
      href: '/onboarding', label: 'Company details', activePaths: ['/onboarding'],
      icon: '<path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>',
    },
  ];

  static TEAM_ITEM = {
    href: '/team', label: 'Team', activePaths: ['/team'],
    icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  };

  /** A page's own detail/editor view (e.g. /app for a single job, /project-detail
   * for a single project) counts as "within" its parent section for highlighting. */
  static _navLink(item) {
    const active = item.activePaths.includes(location.pathname);
    const a = document.createElement('a');
    a.className = active ? 'acct-item active' : 'acct-item';
    a.href = item.href;
    a.setAttribute('role', 'menuitem');
    if (active) {
      a.setAttribute('aria-current', 'page');
      // Still a real link (so it degrades sensibly), but there's nowhere
      // useful for "go to the page you're already on" to take you.
      a.addEventListener('click', (e) => e.preventDefault());
    }
    a.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>${item.label}`;
    return a;
  }

  /**
   * @param {object} user  signed-in user ({ name, email, profile, isOwner })
   * @param {import('./SessionGuard')} guard  used to wire the Sign out action
   * @param {() => Promise<void>} [beforeLogout]  e.g. a page's autosave flush,
   *   awaited before the session actually ends
   */
  static mount(user, guard, beforeLogout) {
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

    const menu = root.querySelector('.acct-menu');
    const head = menu.querySelector('.acct-head');

    // Free-plan usage, shown right in the header so it's visible from every
    // page without each one building its own copy. Removed first in case
    // mount() ever runs twice, so a stale count never lingers behind a fresh one.
    const oldQuota = head.querySelector('.acct-quota');
    if (oldQuota) oldQuota.remove();
    const quota = user.jobQuota;
    if (quota && !quota.unlimited) {
      const quotaEl = document.createElement('div');
      quotaEl.className = quota.atCap ? 'acct-quota at-cap' : 'acct-quota';
      quotaEl.textContent = `${quota.count} of ${quota.cap} free job cards used this month`;
      head.appendChild(quotaEl);
    }

    // Team management only makes sense for the account owner - the API
    // enforces this independently either way, this just avoids offering a
    // link that would 402/403 for anyone else.
    const items = user.isOwner ? [...AccountMenu.NAV_ITEMS, AccountMenu.TEAM_ITEM] : AccountMenu.NAV_ITEMS;

    const sep = document.createElement('div');
    sep.className = 'acct-sep';

    const signOut = document.createElement('button');
    signOut.type = 'button';
    signOut.className = 'acct-item danger';
    signOut.setAttribute('role', 'menuitem');
    signOut.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Sign out';
    signOut.addEventListener('click', async () => {
      if (beforeLogout) await beforeLogout();
      await guard.logout();
      location.replace('/');
    });

    // Rebuild everything after the head fresh each call, so a page whose
    // static HTML still has old hardcoded items (or a second mount() call)
    // never ends up with duplicates.
    while (head.nextSibling) head.nextSibling.remove();
    items.forEach((item) => menu.appendChild(AccountMenu._navLink(item)));
    menu.append(sep, signOut);

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
