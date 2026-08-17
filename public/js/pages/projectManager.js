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
    this._jobStore = new JobStore(this._api);
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
    const jobsPromise = this._jobStore.listJobs();
    jobsPromise.catch(() => {});

    const user = await this._guard.requireOnboardedUser();
    if (!user) return;

    this._applyProfile(user.profile);

    // Load the project list before wiring up secondary UI - a broken button
    // binding below should never be able to stop the page's core content
    // (the list itself) from loading and rendering.
    await this._refresh(jobsPromise);

    this._safeBind(() => AccountMenu.mount(user));
    this._safeBind(() => this._bindHeader());
    this._safeBind(() => this._bindExport());
    this._safeBind(() => this._bindQuickAdd());
  }

  /** Runs a UI-binding step in isolation so one failure can't cascade. */
  _safeBind(fn) {
    try { fn(); } catch (err) { console.error('SiteWise: UI binding failed', err); }
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
      await this._guard.logout();
      location.replace('/');
    });
    this._$('editProfile').addEventListener('click', () => location.assign('/onboarding'));
  }

  async _refresh(preloaded) {
    const { jobs, offline } = await (preloaded || this._jobStore.listJobs());
    this._projects = jobs.filter((j) => j.projectStatus);
    this._renderFilters();
    this._renderList();
    if (offline) this._toast('Offline - showing your last-saved projects');
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

  // ── CSV export ────────────────────────────────────────────────

  _bindExport() {
    this._$('exportCsv').addEventListener('click', () => this._exportCsv());
  }

  /**
   * Exports the currently filtered/visible projects, with full financial
   * figures (not just the dashboard summary) - fetches each project's full
   * data so the export is actually useful for handing to an accountant.
   */
  async _exportCsv() {
    const targets = this._filtered();
    if (!targets.length) {
      this._toast('No projects to export');
      return;
    }
    this._toast(`Preparing export of ${targets.length} project${targets.length > 1 ? 's' : ''}…`);
    try {
      const jobs = await Promise.all(targets.map(async (t) => {
        const { job } = await this._api.getJob(t.id);
        return Job.fromJSON(job.id, job.data);
      }));

      const rows = jobs.map((job) => {
        const p = job.project || {};
        return {
          client: job.clientName,
          address: job.siteAddress,
          type: Job.JOB_TYPES[job.jobType] || job.jobType || '',
          status: Job.PROJECT_STATUSES[p.status] || p.status || '',
          startDate: p.startDate || '',
          plannedCompletion: p.plannedCompletion || '',
          projectValue: (p.value || 0).toFixed(2),
          variationsTotal: job.variationsTotal.toFixed(2),
          revisedValue: job.revisedValue.toFixed(2),
          depositAmount: (p.depositAmount || 0).toFixed(2),
          depositPaidDate: p.depositPaidDate || '',
          materialSpend: job.materialTotal.toFixed(2),
          wagesSpend: job.wagesTotal.toFixed(2),
          totalSpend: job.totalSpend.toFixed(2),
          budgetRemaining: job.budgetRemaining.toFixed(2),
          hoursLogged: job.timeLoggedHours,
          timeEarned: job.timeEarned.toFixed(2),
        };
      });

      CsvExport.download(`projects-${this._today()}.csv`, rows, [
        { key: 'client', label: 'Client' },
        { key: 'address', label: 'Address' },
        { key: 'type', label: 'Type' },
        { key: 'status', label: 'Status' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'plannedCompletion', label: 'Planned Completion' },
        { key: 'projectValue', label: 'Project Value (R)' },
        { key: 'variationsTotal', label: 'Variations (R)' },
        { key: 'revisedValue', label: 'Revised Value (R)' },
        { key: 'depositAmount', label: 'Deposit Paid (R)' },
        { key: 'depositPaidDate', label: 'Deposit Paid Date' },
        { key: 'materialSpend', label: 'Material Spend (R)' },
        { key: 'wagesSpend', label: 'Wages Spend (R)' },
        { key: 'totalSpend', label: 'Total Spend (R)' },
        { key: 'budgetRemaining', label: 'Budget Remaining (R)' },
        { key: 'hoursLogged', label: 'Hours Logged' },
        { key: 'timeEarned', label: 'Time Earned (R)' },
      ]);
      this._toast('Export downloaded');
    } catch (err) {
      this._toast(err.message || 'Could not export projects');
    }
  }

  _today() {
    return new Date().toISOString().slice(0, 10);
  }

  // ── Add a project without a quote ───────────────────────────────

  _bindQuickAdd() {
    const typeSelect = this._$('qaType');
    Object.entries(Job.JOB_TYPES).forEach(([key, label]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      typeSelect.appendChild(opt);
    });

    this._$('pickJob').addEventListener('click', () => {
      const card = this._$('quickAddCard');
      card.hidden = !card.hidden;
      if (!card.hidden) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        this._$('qaClient').focus();
      }
    });

    this._$('qaCreate').addEventListener('click', () => this._createQuickProject());
  }

  async _createQuickProject() {
    const clientName = this._$('qaClient').value.trim();
    const siteAddress = this._$('qaAddress').value.trim();
    if (!clientName) {
      this._toast('Add a client name first');
      return;
    }

    const job = new Job();
    job.clientName = clientName;
    job.siteAddress = siteAddress;
    job.jobType = this._$('qaType').value || null;
    job.project = Job.newProject(Number(this._$('qaValue').value) || 0);

    try {
      // Goes through JobStore, not ApiClient directly, so this works
      // offline too: the project is written to IndexedDB first and only
      // then does a sync attempt happen - a network failure here isn't an
      // error, the project still gets created locally and queues to sync.
      await this._jobStore.saveJob(job.id, job.toJSON());
      location.assign(`/project-detail?id=${job.id}`);
    } catch (err) {
      this._toast(err.message || 'Could not create that project');
    }
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
