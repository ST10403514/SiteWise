'use strict';

/** JobsPage - the tenant's dashboard of saved job cards. */
class JobsPage {
  constructor() {
    this._api = new ApiClient();
    this._guard = new SessionGuard(this._api);
    this._$ = (id) => document.getElementById(id);
    this._toastTimer = null;
  }

  async init() {
    const user = await this._guard.requireOnboardedUser();
    if (!user) return;

    this._applyProfile(user.profile);
    AccountMenu.mount(user);
    this._bindHeader();
    await this._refresh();
  }

  _applyProfile(profile) {
    Theme.apply(profile.scheme);
    this._$('companyName').textContent = profile.companyName;
    this._$('companyTagline').textContent = profile.tagline || 'Your job cards';
    const logoBox = this._$('companyLogo');
    if (profile.logo) {
      logoBox.innerHTML = `<img src="${profile.logo}" alt="">`;
    } else {
      logoBox.textContent = (profile.companyName || 'S')[0].toUpperCase();
    }
  }

  _bindHeader() {
    this._$('logout').addEventListener('click', async () => {
      await this._api.logout();
      location.replace('/');
    });
    this._$('editProfile').addEventListener('click', () => location.assign('/onboarding'));
  }

  async _refresh() {
    const { jobs } = await this._api.listJobs();
    const list = this._$('jobList');
    list.innerHTML = '';
    this._$('jobsEmpty').hidden = jobs.length > 0;
    this._$('jobsCount').textContent = jobs.length
      ? `${jobs.length} saved job card${jobs.length > 1 ? 's' : ''}` : '';
    jobs.forEach((job) => list.appendChild(this._buildCard(job)));
  }

  _buildCard(job) {
    const card = document.createElement('article');
    card.className = 'job-card';

    const outcomeLabels = {
      pass: 'Pass', work: 'Further work required', monitor: 'Monitor',
    };
    const updated = new Date(job.updatedAt).toLocaleDateString('en-ZA', {
      day: 'numeric', month: 'short', year: 'numeric',
    });

    const main = document.createElement('div');
    main.innerHTML = `
      <div class="who">
        <strong>${this._escape(job.clientName) || 'Unnamed client'}</strong>
        <span class="qn">${this._escape(job.quoteNumber)}</span>
      </div>
      <div class="meta">${this._escape(job.siteAddress) || 'No site address yet'}
        &nbsp;·&nbsp; Updated ${updated}
        ${job.photoCount ? `&nbsp;·&nbsp; ${job.photoCount} photo${job.photoCount > 1 ? 's' : ''}` : ''}
      </div>`;

    const side = document.createElement('div');
    side.className = 'side';
    side.innerHTML = `
      <div class="total">${Job.formatCurrency(job.grandTotal || 0)}</div>
      ${job.outcome ? `<span class="badge ${job.outcome}">${outcomeLabels[job.outcome] || job.outcome}</span>` : ''}`;

    const actions = document.createElement('div');
    actions.className = 'actions';
    const open = document.createElement('a');
    open.href = `/app?id=${encodeURIComponent(job.id)}`;
    open.textContent = 'Open job card';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => this._delete(job));
    actions.append(open, del);

    card.append(main, side, actions);
    return card;
  }

  async _delete(job) {
    const label = job.clientName || job.quoteNumber;
    if (!confirm(`Delete the job card for "${label}"? This can't be undone.`)) return;
    try {
      await this._api.deleteJob(job.id);
      this._toast('Job card deleted');
      await this._refresh();
    } catch (err) {
      this._toast(err.message);
    }
  }

  _escape(value) {
    const div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }

  _toast(message) {
    const toast = this._$('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }
}

new JobsPage().init();