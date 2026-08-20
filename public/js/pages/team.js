'use strict';

/** TeamPage - invite/list/remove team members. Owner-only actions; the
 * server enforces this independently (requireOwner), this page just avoids
 * offering buttons that would 403 anyway. */
class TeamPage {
  constructor() {
    this._api = new ApiClient();
    this._guard = new SessionGuard(this._api);
    this._$ = (id) => document.getElementById(id);
    this._toastTimer = null;
    this._user = null;
  }

  async init() {
    const user = await this._guard.requireOnboardedUser();
    if (!user) return;
    this._user = user;

    this._applyProfile(user.profile);
    AccountMenu.mount(user);
    this._bindHeader();
    this._bindInvite();
    await this._refresh();
  }

  _applyProfile(profile) {
    Theme.apply(profile.scheme);
    this._$('companyName').textContent = profile.companyName;
    const logoBox = this._$('companyLogo');
    if (profile.logo) {
      logoBox.innerHTML = `<img src="${profile.logo}" alt="">`;
    } else {
      logoBox.textContent = (profile.companyName || 'S')[0].toUpperCase();
    }
  }

  _bindHeader() {
    this._$('logout').addEventListener('click', async () => {
      await this._guard.logout();
      location.replace('/');
    });
    this._$('editProfile').addEventListener('click', () => location.assign('/onboarding'));
  }

  _bindInvite() {
    if (!this._user.isOwner) return; // neither card is shown to a non-owner
    if (this._user.tier !== 'team') {
      this._$('upgradeCard').hidden = false;
      return;
    }
    this._$('inviteCard').hidden = false;
    const emailInput = this._$('inviteEmail');
    const btn = this._$('inviteBtn');
    const submit = async () => {
      const email = emailInput.value.trim();
      if (!email) { this._toast('Enter an email address first'); return; }
      btn.disabled = true;
      try {
        await this._api.inviteTeamMember(email);
        this._toast(`Invite sent to ${email}`);
        emailInput.value = '';
      } catch (err) {
        this._toast(err.message);
      } finally {
        btn.disabled = false;
      }
    };
    btn.addEventListener('click', submit);
    emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  async _refresh() {
    const { members } = await this._api.listTeamMembers();
    this._renderList(members);
  }

  _renderList(members) {
    const list = this._$('memberList');
    list.innerHTML = '';
    this._$('teamEmpty').hidden = members.length > 0;

    members.forEach((member) => {
      const row = document.createElement('div');
      row.className = 'member-row';

      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.textContent = (member.name || member.email || '?')[0].toUpperCase();

      const who = document.createElement('div');
      who.className = 'who';
      const strong = document.createElement('strong');
      strong.textContent = member.name;
      const span = document.createElement('span');
      span.textContent = member.email;
      who.append(strong, span);

      row.append(avatar, who);

      if (member.isOwner) {
        const badge = document.createElement('span');
        badge.className = 'badge-owner';
        badge.textContent = 'Owner';
        row.append(badge);
      } else if (this._user.isOwner) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => this._remove(member));
        row.append(removeBtn);
      }

      list.append(row);
    });
  }

  async _remove(member) {
    if (!confirm(`Remove ${member.name} (${member.email}) from the team? They'll lose access immediately.`)) return;
    try {
      await this._api.removeTeamMember(member.id);
      this._toast(`${member.name} removed`);
      await this._refresh();
    } catch (err) {
      this._toast(err.message);
    }
  }

  _toast(message) {
    const toast = this._$('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }
}

new TeamPage().init();
