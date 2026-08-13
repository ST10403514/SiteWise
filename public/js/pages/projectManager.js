'use strict';

/**
 * ProjectManagerPage - dashboard of jobs whose quote has been accepted and
 * handed over to execution tracking (job.project is set). Reuses the same
 * /api/jobs list the job-card dashboard uses; a "project" is just a job
 * further along in its lifecycle, not a separate record.
 */
class ProjectManagerPage {
  constructor() {
    this._api = new ApiClient();
    this._guard = new SessionGuard(this._api);
    this._$ = (id) => document.getElementById(id);
    this._toastTimer = null;
    this._projects = [];
    this._statusFilter = 'all';
    this._typeFilter = 'all';
  }

  async init() {
    // Fired alongside the auth check rather than after it - both just need
    // the session cookie, so there's no reason to wait for one round trip
    // to a remote DB before starting the other.
    const jobsPromise = this._api.listJobs();
    jobsPromise.catch(() => {});

    const user = await this._guard.requireOnboardedUser();
    if (!user) return;

    this._applyProfile(user.profile);
    AccountMenu.mount(user);
    this._bindHeader();
    await this._refresh(jobsPromise);
  }

  _applyProfile(profile) {
    Theme.apply(profile.scheme);
    Job.usePresets(profile.industry, profile);
    this._$('companyName').textContent = profile.companyName;
    this._$('companyTagline').textContent = 'Project manager';
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

  async _refresh(preloaded) {
    const { jobs } = await (preloaded || this._api.listJobs());
    this._projects = jobs.filter((j) => j.projectStatus);
    this._renderFilters();
    this._renderList();
  }

  // ── Filters ───────────────────────────────────────────────────

  _renderFilters() {
    const statusBox = this._$('statusFilters');
    statusBox.innerHTML = '';
    const statusOptions = [['all', 'All'], ...Object.entries(Job.PROJECT_STATUSES)];
    statusOptions.forEach(([key, label]) => {
      const count = key === 'all'
        ? this._projects.length
        : this._projects.filter((p) => p.projectStatus === key).length;
      statusBox.appendChild(this._buildFilterChip(label, count, key === this._statusFilter, () => {
        this._statusFilter = key;
        this._renderFilters();
        this._renderList();
      }));
    });

    const typeBox = this._$('typeFilters');
    typeBox.innerHTML = '';
    const types = [...new Set(this._projects.map((p) => p.jobType).filter(Boolean))];
    const typeOptions = [['all', 'All'], ...types.map((key) => [key, Job.JOB_TYPES[key] || 'Other'])];
    typeOptions.forEach(([key, label]) => {
      const count = key === 'all'
        ? this._projects.length
        : this._projects.filter((p) => p.jobType === key).length;
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

  // ── List ──────────────────────────────────────────────────────

  _filtered() {
    return this._projects.filter((p) => {
      if (this._statusFilter !== 'all' && p.projectStatus !== this._statusFilter) return false;
      if (this._typeFilter !== 'all' && p.jobType !== this._typeFilter) return false;
      return true;
    });
  }

  _renderList() {
    const list = this._$('projectList');
    list.innerHTML = '';
    const filtered = this._filtered();
    this._$('projectsEmpty').hidden = this._projects.length > 0;
    this._$('projectsCount').textContent = this._projects.length
      ? `${this._projects.length} job${this._projects.length > 1 ? 's' : ''} on the books` : '';
    filtered.forEach((project) => list.appendChild(this._buildCard(project)));
  }

  _buildCard(project) {
    const card = document.createElement('article');
    card.className = 'job-card';

    const statusLabel = Job.PROJECT_STATUSES[project.projectStatus] || project.projectStatus;
    const typeLabel = Job.JOB_TYPES[project.jobType] || project.jobType || 'Other';
    const updated = new Date(project.updatedAt).toLocaleDateString('en-ZA', {
      day: 'numeric', month: 'short', year: 'numeric',
    });

    const main = document.createElement('div');
    main.innerHTML = `
      <div class="who">
        <strong>${this._escape(project.clientName) || 'Unnamed client'}</strong>
        <span class="qn">${this._escape(typeLabel)}</span>
      </div>
      <div class="meta">${this._escape(project.siteAddress) || 'No site address yet'}
        &nbsp;&middot;&nbsp; Updated ${updated}
      </div>`;

    const side = document.createElement('div');
    side.className = 'side';
    side.innerHTML = `
      <div class="total">${Job.formatCurrency(project.projectValue || 0)}</div>
      <span class="badge status-${project.projectStatus}">${statusLabel}</span>`;

    const actions = document.createElement('div');
    actions.className = 'actions';
    const open = document.createElement('a');
    open.href = `/project-detail?id=${encodeURIComponent(project.id)}`;
    open.textContent = 'Open project';
    actions.append(open);

    card.append(main, side, actions);
    return card;
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

new ProjectManagerPage().init();
