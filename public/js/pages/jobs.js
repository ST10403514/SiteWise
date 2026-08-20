'use strict';

/** JobsPage - the tenant's dashboard of saved job cards. */
class JobsPage {
  static OUTCOME_LABELS = { pass: 'Pass', work: 'Further work required', monitor: 'Monitor' };

  constructor() {
    this._api = new ApiClient();
    this._guard = new SessionGuard(this._api);
    this._jobStore = new JobStore(this._api);
    this._$ = (id) => document.getElementById(id);
    this._toastTimer = null;
    this._jobs = [];
    this._searchQuery = '';
    this._outcomeFilter = 'all';
    this._typeFilter = 'all';
  }

  async init() {
    // Fired alongside the auth check rather than after it - both just need
    // the session cookie, and waiting for one before starting the other
    // doubles the round trip to a remote DB for no reason. If the auth
    // check fails, this result is simply never awaited.
    const jobsPromise = this._jobStore.listJobs();
    jobsPromise.catch(() => {});

    const user = await this._guard.requireOnboardedUser();
    if (!user) return;

    this._applyProfile(user.profile);
    AccountMenu.mount(user, this._guard);
    this._bindFilters();
    await this._refresh(jobsPromise);
  }

  _applyProfile(profile) {
    Theme.apply(profile.scheme);
    Job.usePresets(profile.industry, profile);
    this._$('companyName').textContent = profile.companyName;
    this._$('companyTagline').textContent = profile.tagline || 'Your job cards';
    const logoBox = this._$('companyLogo');
    if (profile.logo) {
      logoBox.innerHTML = `<img src="${profile.logo}" alt="">`;
    } else {
      logoBox.textContent = (profile.companyName || 'S')[0].toUpperCase();
    }
  }

  _bindFilters() {
    this._$('jobSearch').addEventListener('input', (e) => {
      this._searchQuery = e.target.value.trim().toLowerCase();
      this._renderList();
    });
  }

  async _refresh(preloaded) {
    const { jobs, offline } = await (preloaded || this._jobStore.listJobs());
    this._jobs = jobs;
    this._renderFilters();
    this._renderList();
    if (offline) this._toast('Offline - showing your last-saved job cards');
  }

  // ── Filters ───────────────────────────────────────────────────

  _renderFilters() {
    const outcomeBox = this._$('outcomeFilters');
    outcomeBox.innerHTML = '';
    const outcomeOptions = [['all', 'All'], ...Object.entries(JobsPage.OUTCOME_LABELS)];
    outcomeOptions.forEach(([key, label]) => {
      const count = key === 'all' ? this._jobs.length : this._jobs.filter((j) => j.outcome === key).length;
      outcomeBox.appendChild(this._buildFilterChip(label, count, key === this._outcomeFilter, () => {
        this._outcomeFilter = key;
        this._renderFilters();
        this._renderList();
      }));
    });

    const typeBox = this._$('jobTypeFilters');
    typeBox.innerHTML = '';
    const types = [...new Set(this._jobs.map((j) => j.jobType).filter(Boolean))];
    const typeOptions = [['all', 'All'], ...types.map((key) => [key, Job.JOB_TYPES[key] || 'Other'])];
    typeOptions.forEach(([key, label]) => {
      const count = key === 'all' ? this._jobs.length : this._jobs.filter((j) => j.jobType === key).length;
      typeBox.appendChild(this._buildFilterChip(label, count, key === this._typeFilter, () => {
        this._typeFilter = key;
        this._renderFilters();
        this._renderList();
      }));
    });
  }

  _buildFilterChip(label, count, active, onClick) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.setAttribute('aria-pressed', String(active));
    chip.textContent = count ? `${label} (${count})` : label;
    chip.addEventListener('click', onClick);
    return chip;
  }

  _filtered() {
    return this._jobs.filter((j) => {
      if (this._outcomeFilter !== 'all' && j.outcome !== this._outcomeFilter) return false;
      if (this._typeFilter !== 'all' && j.jobType !== this._typeFilter) return false;
      if (this._searchQuery) {
        const haystack = `${j.clientName || ''} ${j.siteAddress || ''} ${j.quoteNumber || ''}`.toLowerCase();
        if (!haystack.includes(this._searchQuery)) return false;
      }
      return true;
    });
  }

  // ── List ──────────────────────────────────────────────────────

  _renderList() {
    const list = this._$('jobList');
    list.innerHTML = '';
    const filtered = this._filtered();
    this._$('jobsEmpty').hidden = this._jobs.length > 0;
    this._$('jobsFilterEmpty').hidden = this._jobs.length === 0 || filtered.length > 0;
    this._$('jobsCount').textContent = this._jobs.length
      ? `${this._jobs.length} saved job card${this._jobs.length > 1 ? 's' : ''}` : '';
    filtered.forEach((job) => list.appendChild(this._buildCard(job)));
  }

  _buildCard(job) {
    const card = document.createElement('article');
    card.className = 'job-card';

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
      ${job.outcome ? `<span class="badge ${job.outcome}">${JobsPage.OUTCOME_LABELS[job.outcome] || job.outcome}</span>` : ''}`;

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
