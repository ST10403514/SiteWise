'use strict';

/**
 * ProjectDetailPage - the execution-tracking view for a job whose quote has
 * been accepted (job.project is set). Tabs: Overview, Expenses (which holds
 * material expenses, staff & wages, time, and variations - one tab for
 * every ledger, not one tab per ledger), Site Photos, Export. Everything
 * autosaves through the same
 * PUT /api/jobs/:id endpoint the job card uses - a project is still one
 * job row, just with its `project` sub-object populated.
 */
class ProjectDetailPage {
  static AUTOSAVE_MS = 2500;

  constructor() {
    this._api = new ApiClient();
    this._guard = new SessionGuard(this._api);
    this._jobStore = new JobStore(this._api);
    this._job = null;
    this._dirty = false;
    this._saving = false;
    this._$ = (id) => document.getElementById(id);
    this._toastTimer = null;
  }

  async init() {
    // Fired alongside the auth check rather than after it - both just need
    // the session cookie, so there's no reason to wait a full round trip to
    // a remote DB for one before starting the other.
    const existingId = new URLSearchParams(location.search).get('id');
    const jobPromise = existingId ? this._jobStore.getJob(existingId) : null;
    if (jobPromise) jobPromise.catch(() => {});

    const user = await this._guard.requireOnboardedUser();
    if (!user) return;

    this._applyProfile(user.profile);
    AccountMenu.mount(user);
    this._job = await this._loadJob(jobPromise);
    if (!this._job) return;

    this._bindHeader();
    this._bindTabs();
    this._bindOverview();
    this._bindExpenses();
    this._bindWages();
    this._bindTime();
    this._bindVariations();
    this._bindSitePhotos();
    this._bindExport();

    this._hydrate();
    this._startAutosave();
  }

  _applyProfile(profile) {
    Theme.apply(profile.scheme);
    Job.usePresets(profile.industry, profile);
    PDFService.configure(profile);
    this._profile = profile;
    const logoBox = this._$('companyLogo');
    if (profile.logo) {
      logoBox.innerHTML = `<img src="${profile.logo}" alt="">`;
    } else {
      logoBox.textContent = (profile.companyName || 'S')[0].toUpperCase();
    }
  }

  async _loadJob(preloadedPromise) {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) {
      location.replace('/project-manager');
      return null;
    }
    try {
      const { job, offline, pending } = await (preloadedPromise || this._jobStore.getJob(id));
      const parsed = Job.fromJSON(job.id, job.data);
      if (!parsed.project) parsed.project = Job.newProject(parsed.grandTotal);
      if (pending) this._toast('Showing your unsynced changes from earlier - still saved on this device');
      else if (offline) this._toast('Offline - showing your last-saved version of this project');
      return parsed;
    } catch {
      this._toast('Could not open that project');
      location.replace('/project-manager');
      return null;
    }
  }

  _bindHeader() {
    this._$('logout').addEventListener('click', async () => {
      await this._flushSave();
      await this._guard.logout();
      location.replace('/');
    });
    this._$('editProfile').addEventListener('click', () => location.assign('/onboarding'));
  }

  _bindTabs() {
    const tabs = [...this._$('tabs').querySelectorAll('.tab')];
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
        tabs.forEach((t) => {
          this._$(`panel-${t.dataset.tab}`).hidden = t !== tab;
        });
      });
    });
  }

  // ── Overview ──────────────────────────────────────────────────

  _bindOverview() {
    const select = this._$('pType');
    Object.entries(Job.JOB_TYPES).forEach(([key, label]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      select.appendChild(opt);
    });
    select.addEventListener('change', (e) => { this._job.jobType = e.target.value; this._changed(); });

    const bindNumber = (id, prop) => {
      this._$(id).addEventListener('input', (e) => {
        this._job.project[prop] = Number(e.target.value) || 0;
        this._changed();
      });
    };
    const bindDate = (id, prop) => {
      this._$(id).addEventListener('input', (e) => {
        this._job.project[prop] = e.target.value || null;
        this._changed();
      });
    };
    bindNumber('pStaff', 'staffAtStart');
    bindDate('pStart', 'startDate');
    bindDate('pPlanned', 'plannedCompletion');
    bindDate('pActual', 'actualCompletion');
    bindNumber('pValue', 'value');
    bindNumber('pOpeningBudget', 'openingBudget');
    bindNumber('pDeposit', 'depositAmount');
    bindDate('pDepositDate', 'depositPaidDate');
    bindNumber('pMaterialBudget', 'materialBudget');
    bindNumber('pLabourBudget', 'labourBudget');
    this._$('pNotes').addEventListener('input', (e) => {
      this._job.project.notes = e.target.value;
      this._changed();
    });

    this._$('budgetModeGroup').querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._job.project.budgetMode = btn.dataset.mode;
        this._syncBudgetMode();
        this._changed();
      });
    });

    const statusBox = this._$('statusGroup');
    Object.entries(Job.PROJECT_STATUSES).forEach(([key, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'outcome';
      btn.dataset.k = key;
      btn.innerHTML = `<strong>${label}</strong>`;
      btn.addEventListener('click', () => {
        this._job.project.status = key;
        this._syncStatus();
        this._changed();
      });
      statusBox.appendChild(btn);
    });

    this._$('dlOvQuote').addEventListener('click', () => {
      if (!this._hasQuotableItems()) return;
      this._flushSave();
      PDFService.downloadQuote(this._job.forPdf());
      this._toast('Quote PDF downloaded');
    });
    this._$('dlOvFull').addEventListener('click', () => {
      if (!this._hasQuotableItems()) return;
      this._flushSave();
      PDFService.downloadFull(this._job.forPdf());
      this._toast('Full report + quote downloaded');
    });

    this._$('deleteProject').addEventListener('click', async () => {
      if (this._job.project.status !== 'completed') return;
      if (!confirm('Delete this project? This can\'t be undone.')) return;
      try {
        await this._api.deleteJob(this._job.id);
        this._toast('Project deleted');
        location.assign('/project-manager');
      } catch (err) {
        this._toast(err.message || 'Could not delete this project');
      }
    });
  }

  _hasQuotableItems() {
    if (this._job.lineItems.some((it) => it.description.trim())) return true;
    this._toast('This job has no priced line items yet');
    return false;
  }

  _syncStatus() {
    const status = this._job.project.status;
    this._$('statusGroup').querySelectorAll('.outcome').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.k === status));
    });
    const badge = this._$('statusBadge');
    badge.textContent = Job.PROJECT_STATUSES[status] || status;
    badge.className = `badge status-badge status-${status}`;

    const del = this._$('deleteProject');
    const isCompleted = status === 'completed';
    del.disabled = !isCompleted;
    this._$('deleteHint').textContent = isCompleted
      ? 'This project is completed and can be deleted.'
      : 'A project can only be deleted once its status is Completed.';
  }

  _syncBudgetMode() {
    const mode = this._job.project.budgetMode === 'split' ? 'split' : 'total';
    this._$('budgetModeGroup').querySelectorAll('.chip').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    });
    this._$('budgetTotalFields').hidden = mode !== 'total';
    this._$('budgetSplitFields').hidden = mode !== 'split';
  }

  _syncTimeUnit() {
    const unit = this._job.project.estimatedTimeUnit === 'days' ? 'days' : 'hours';
    this._$('timeUnitGroup').querySelectorAll('.chip').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.unit === unit));
    });
  }

  _renderSpendSummary() {
    const job = this._job;
    const mode = job.project.budgetMode === 'split' ? 'split' : 'total';
    const rows = [
      ['Material total', Job.formatCurrency(job.materialTotal)],
      ['Wages total', Job.formatCurrency(job.wagesTotal)],
    ];
    let html = rows
      .map(([label, value]) => `<div class="row"><span>${label}</span><span>${value}</span></div>`)
      .join('')
      + `<div class="row grand"><span>Total spend</span><span>${Job.formatCurrency(job.totalSpend)}</span></div>`
      + `<div class="row"><span>Cost per staff member</span><span>${Job.formatCurrency(job.costPerStaff)}</span></div>`;

    if (mode === 'split') {
      html += `<div class="row"><span>Material budget remaining</span><span>${Job.formatCurrency(job.materialBudgetRemaining)}</span></div>`
        + `<div class="row"><span>Labour budget remaining</span><span>${Job.formatCurrency(job.labourBudgetRemaining)}</span></div>`;
    }
    html += `<div class="row"><span>Budget remaining</span><span>${Job.formatCurrency(job.budgetRemaining)}</span></div>`;

    if (job.project.hourlyRate > 0 || job.timeLoggedHours > 0) {
      html += `<div class="row"><span>Hours logged</span><span>${job.timeLoggedHours}h</span></div>`
        + `<div class="row"><span>Time earned</span><span>${Job.formatCurrency(job.timeEarned)}</span></div>`;
    }
    if (job.variationsTotal > 0) {
      html += `<div class="row"><span>Approved variations</span><span>${Job.formatCurrency(job.variationsTotal)}</span></div>`;
    }

    this._$('spendSummary').innerHTML = html;
  }

  _renderQuoteSummary() {
    const job = this._job;
    const deposit = job.project.depositAmount > 0
      ? `${Job.formatCurrency(job.project.depositAmount)}${job.project.depositPaidDate ? ` (paid ${job.project.depositPaidDate})` : ''}`
      : 'Not yet paid';
    let html = `
      <div class="row"><span>Quote number</span><span>${this._escape(job.quoteNumber)}</span></div>
      <div class="row"><span>Quote total (incl. VAT)</span><span>${Job.formatCurrency(job.grandTotal)}</span></div>`;
    if (job.variationsTotal > 0) {
      html += `<div class="row"><span>Approved variations</span><span>${Job.formatCurrency(job.variationsTotal)}</span></div>
        <div class="row"><span>Revised project value</span><span>${Job.formatCurrency(job.revisedValue)}</span></div>`;
    }
    html += `<div class="row grand"><span>Deposit</span><span>${deposit}</span></div>`;
    this._$('quoteSummary').innerHTML = html;
  }

  // ── Ledgers shared helpers ───────────────────────────────────

  _uid() {
    return (crypto.randomUUID && crypto.randomUUID()) || `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  async _readOptionalPhoto(inputEl, folder) {
    const file = inputEl.files?.[0];
    if (!file) return null;
    const dataUrl = await ImageTools.compress(file, 1000, 0.8);
    try {
      const { url } = await this._api.uploadPhoto(dataUrl, folder);
      return url;
    } catch {
      return dataUrl; // fall back to inline data URL if upload fails
    }
  }

  // ── Expenses ──────────────────────────────────────────────────

  _bindExpenses() {
    this._$('expDate').value = this._today();
    this._$('addExpense').addEventListener('click', async () => {
      const description = this._$('expDesc').value.trim();
      const amount = Number(this._$('expAmount').value) || 0;
      const date = this._$('expDate').value || this._today();
      if (!description) {
        this._toast('Add a description first');
        return;
      }
      const photoUrl = await this._readOptionalPhoto(this._$('expPhoto'), 'expenses');
      this._job.project.expenses.push({ id: this._uid(), date, description, amount, photoUrl });
      this._$('expDesc').value = '';
      this._$('expAmount').value = '';
      this._$('expPhoto').value = '';
      this._renderExpenses();
      this._changed();
      this._toast('Expense added');
    });
  }

  _renderExpenses() {
    const list = this._$('expenseList');
    list.innerHTML = '';
    const entries = this._job.project.expenses;
    this._$('expensesEmpty').hidden = entries.length > 0;
    entries.forEach((entry) => list.appendChild(this._buildLedgerRow(entry, entry.description, () => {
      this._job.project.expenses = this._job.project.expenses.filter((e) => e.id !== entry.id);
      this._renderExpenses();
      this._changed();
    })));
    this._$('materialTotal').textContent = Job.formatCurrency(this._job.materialTotal);
    this._updateExpensesBadge();
  }

  // ── Staff & Wages ─────────────────────────────────────────────

  _bindWages() {
    this._$('wageDate').value = this._today();
    this._$('addWage').addEventListener('click', async () => {
      const name = this._$('wageName').value.trim();
      const role = this._$('wageRole').value.trim();
      const amount = Number(this._$('wageAmount').value) || 0;
      const date = this._$('wageDate').value || this._today();
      if (!name || amount <= 0) {
        this._toast('Add a staff name and amount first');
        return;
      }
      const photoUrl = await this._readOptionalPhoto(this._$('wagePhoto'), 'wages');
      this._job.project.staffWages.push({ id: this._uid(), date, name, role, amount, photoUrl });
      this._$('wageName').value = '';
      this._$('wageRole').value = '';
      this._$('wageAmount').value = '';
      this._$('wagePhoto').value = '';
      this._renderWages();
      this._changed();
      this._toast('Wage entry added');
    });
  }

  _renderWages() {
    const list = this._$('wageList');
    list.innerHTML = '';
    const entries = this._job.project.staffWages;
    this._$('wagesEmpty').hidden = entries.length > 0;
    entries.forEach((entry) => list.appendChild(this._buildLedgerRow(
      entry, entry.role ? `${entry.name} - ${entry.role}` : entry.name, () => {
        this._job.project.staffWages = this._job.project.staffWages.filter((e) => e.id !== entry.id);
        this._renderWages();
        this._changed();
      },
    )));
    this._$('wagesTotal').textContent = Job.formatCurrency(this._job.wagesTotal);
    this._updateExpensesBadge();
  }

  // ── Time (rate + logged hours vs. estimate) ─────────────────────

  _bindTime() {
    const bindNumber = (id, prop) => {
      this._$(id).addEventListener('input', (e) => {
        this._job.project[prop] = Number(e.target.value) || 0;
        this._changed();
      });
    };
    bindNumber('pHourlyRate', 'hourlyRate');
    bindNumber('pEstimatedTime', 'estimatedTime');

    this._$('timeUnitGroup').querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._job.project.estimatedTimeUnit = btn.dataset.unit;
        this._syncTimeUnit();
        this._changed();
      });
    });

    this._$('timeDate').value = this._today();
    this._$('addTime').addEventListener('click', () => {
      const hours = Number(this._$('timeHours').value) || 0;
      const date = this._$('timeDate').value || this._today();
      const note = this._$('timeNote').value.trim();
      if (hours <= 0) {
        this._toast('Add how many hours were worked first');
        return;
      }
      this._job.project.timeEntries.push({ id: this._uid(), date, hours, note });
      this._$('timeHours').value = '';
      this._$('timeNote').value = '';
      this._renderTimeEntries();
      this._changed();
      this._toast('Time logged');
    });
  }

  _renderTimeEntries() {
    const list = this._$('timeList');
    list.innerHTML = '';
    const entries = this._job.project.timeEntries;
    this._$('timeEmpty').hidden = entries.length > 0;
    entries.forEach((entry) => list.appendChild(this._buildLedgerRow(
      entry, entry.note || 'Time logged', () => {
        this._job.project.timeEntries = this._job.project.timeEntries.filter((e) => e.id !== entry.id);
        this._renderTimeEntries();
        this._changed();
      },
      `${entry.hours}h`,
    )));

    const job = this._job;
    const rows = [
      ['Hours logged', `${job.timeLoggedHours}h`],
      ['Amount earned', Job.formatCurrency(job.timeEarned)],
    ];
    let html = rows.map(([label, value]) => `<div class="row"><span>${label}</span><span>${value}</span></div>`).join('');
    if (job.project.estimatedTime > 0) {
      html += `<div class="row"><span>Estimated</span><span>${job.estimatedHoursTotal}h</span></div>`
        + `<div class="row grand"><span>Hours remaining</span><span>${job.timeRemainingHours}h</span></div>`;
    }
    this._$('timeSummary').innerHTML = html;
    this._updateExpensesBadge();
  }

  // ── Tab badges ────────────────────────────────────────────────

  _setTabLabel(tabKey, label, count) {
    const tab = this._$('tabs').querySelector(`[data-tab="${tabKey}"]`);
    tab.textContent = count ? `${label} (${count})` : label;
  }

  /** One combined count across every ledger now living on the Expenses tab. */
  _updateExpensesBadge() {
    const p = this._job.project;
    const count = p.expenses.length + p.staffWages.length + p.timeEntries.length + p.variations.length;
    this._setTabLabel('expenses', 'Expenses', count);
  }

  // ── Shared ledger row builder (Expenses + Staff & Wages) ───────

  _buildLedgerRow(entry, title, onRemove, amountText) {
    const row = document.createElement('div');
    row.className = 'ledger-row';

    if (entry.photoUrl) {
      const thumb = document.createElement('img');
      thumb.className = 'ledger-thumb';
      thumb.loading = 'lazy';
      thumb.src = entry.photoUrl;
      thumb.alt = '';
      row.appendChild(thumb);
    }

    const info = document.createElement('div');
    info.className = 'ledger-info';
    info.innerHTML = `<strong>${this._escape(title)}</strong><span>${this._escape(entry.date)}</span>`;
    row.appendChild(info);

    const amount = document.createElement('div');
    amount.className = 'ledger-amount';
    amount.textContent = amountText !== undefined ? amountText : Job.formatCurrency(entry.amount);
    row.appendChild(amount);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ledger-remove';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', 'Remove entry');
    remove.addEventListener('click', onRemove);
    row.appendChild(remove);

    return row;
  }

  // ── Variations (extra work approved beyond the original quote) ──

  _bindVariations() {
    this._$('varDate').value = this._today();
    this._$('addVariation').addEventListener('click', () => {
      const description = this._$('varDesc').value.trim();
      const amount = Number(this._$('varAmount').value) || 0;
      const date = this._$('varDate').value || this._today();
      if (!description) {
        this._toast('Add a description first');
        return;
      }
      this._job.project.variations.push({ id: this._uid(), date, description, amount });
      this._$('varDesc').value = '';
      this._$('varAmount').value = '';
      this._renderVariations();
      this._changed();
      this._toast('Variation added');
    });
  }

  _renderVariations() {
    const list = this._$('variationList');
    list.innerHTML = '';
    const entries = this._job.project.variations;
    this._$('variationsEmpty').hidden = entries.length > 0;
    entries.forEach((entry) => list.appendChild(this._buildLedgerRow(entry, entry.description, () => {
      this._job.project.variations = this._job.project.variations.filter((e) => e.id !== entry.id);
      this._renderVariations();
      this._changed();
    })));
  }

  // ── Export (one CSV with everything logged on this job) ─────────

  _bindExport() {
    this._$('exportAll').addEventListener('click', () => this._exportAll());
  }

  _exportAll() {
    const job = this._job;
    const p = job.project;
    const rate = Number(p.hourlyRate) || 0;

    const sections = [
      {
        title: 'PROJECT SUMMARY',
        columns: [{ key: 'field', label: 'Field' }, { key: 'value', label: 'Value' }],
        rows: [
          { field: 'Client', value: job.clientName },
          { field: 'Site address', value: job.siteAddress },
          { field: 'Quote number', value: job.quoteNumber },
          { field: 'Status', value: Job.PROJECT_STATUSES[p.status] || p.status },
          { field: 'Project value (R)', value: (p.value || 0).toFixed(2) },
          { field: 'Variations (R)', value: job.variationsTotal.toFixed(2) },
          { field: 'Revised value (R)', value: job.revisedValue.toFixed(2) },
          { field: 'Total spend (R)', value: job.totalSpend.toFixed(2) },
          { field: 'Budget remaining (R)', value: job.budgetRemaining.toFixed(2) },
        ],
      },
      {
        title: 'EXPENSES',
        columns: [
          { key: 'date', label: 'Date' }, { key: 'description', label: 'Description' },
          { key: 'amount', label: 'Amount (R)' },
        ],
        rows: p.expenses.map((e) => ({ date: e.date, description: e.description, amount: (e.amount || 0).toFixed(2) })),
      },
      {
        title: 'STAFF & WAGES',
        columns: [
          { key: 'date', label: 'Date' }, { key: 'name', label: 'Staff Name' },
          { key: 'role', label: 'Role' }, { key: 'amount', label: 'Amount (R)' },
        ],
        rows: p.staffWages.map((w) => ({ date: w.date, name: w.name, role: w.role || '', amount: (w.amount || 0).toFixed(2) })),
      },
      {
        title: 'TIME LOGGED',
        columns: [
          { key: 'date', label: 'Date' }, { key: 'hours', label: 'Hours' },
          { key: 'note', label: 'Note' }, { key: 'amount', label: 'Amount (R)' },
        ],
        rows: p.timeEntries.map((t) => ({ date: t.date, hours: t.hours, note: t.note || '', amount: (t.hours * rate).toFixed(2) })),
      },
      {
        title: 'VARIATIONS',
        columns: [
          { key: 'date', label: 'Date' }, { key: 'description', label: 'Description' },
          { key: 'amount', label: 'Amount (R)' },
        ],
        rows: p.variations.map((v) => ({ date: v.date, description: v.description, amount: (v.amount || 0).toFixed(2) })),
      },
    ];

    CsvExport.downloadMultiTable(`${job.quoteNumber}-export.csv`, sections);
    this._toast('Export downloaded');
  }

  // ── Site photos ───────────────────────────────────────────────

  _bindSitePhotos() {
    this._$('sitePhotoAdd').addEventListener('click', () => this._$('sitePhotoInput').click());
    this._$('sitePhotoInput').addEventListener('change', async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      if (!files.length) return;
      this._toast(`Uploading ${files.length} photo${files.length > 1 ? 's' : ''}…`);
      let added = 0;
      for (const file of files) {
        try {
          const dataUrl = await ImageTools.compress(file, 1000, 0.8);
          let url = dataUrl;
          try {
            const uploaded = await this._api.uploadPhoto(dataUrl, 'site-photos');
            url = uploaded.url;
          } catch { /* fall back to inline data URL */ }
          this._job.project.sitePhotos.push({ id: this._uid(), url, caption: '' });
          added += 1;
          this._renderSitePhotos();
          this._changed();
        } catch (err) {
          this._toast(err.message || 'Could not add that photo');
        }
      }
      if (added) this._toast(`${added} photo${added > 1 ? 's' : ''} added`);
    });
  }

  _renderSitePhotos() {
    const grid = this._$('sitePhotoGrid');
    grid.querySelectorAll('.photo-cell').forEach((el) => el.remove());
    this._job.project.sitePhotos.forEach((photo, i) => {
      const cell = document.createElement('div');
      cell.className = 'photo-cell';
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = photo.url;
      img.alt = photo.caption || `Site photo ${i + 1}`;
      const caption = document.createElement('input');
      caption.placeholder = `Caption - photo ${i + 1}`;
      caption.value = photo.caption;
      caption.addEventListener('input', (e) => { photo.caption = e.target.value; this._changed(); });
      const remove = document.createElement('button');
      remove.className = 'rm';
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        this._job.project.sitePhotos.splice(i, 1);
        this._renderSitePhotos();
        this._changed();
      });
      cell.append(img, caption, remove);
      grid.insertBefore(cell, this._$('sitePhotoAdd'));
    });
    this._setTabLabel('photos', 'Site Photos', this._job.project.sitePhotos.length);
  }

  // ── Hydration ─────────────────────────────────────────────────

  _hydrate() {
    const job = this._job;
    const p = job.project;

    this._$('clientHeading').textContent = job.clientName || 'Unnamed client';
    this._$('addressHeading').textContent = job.siteAddress || 'No site address yet';
    this._$('ovClient').textContent = job.clientName || '—';
    this._$('ovPhone').textContent = job.clientPhone || '—';
    this._$('ovEmail').textContent = job.clientEmail || '—';
    this._$('ovAddress').textContent = job.siteAddress || '—';
    this._$('openJobCard').href = `/app?id=${job.id}`;

    this._$('pType').value = job.jobType || '';
    this._$('pStaff').value = p.staffAtStart || 0;
    this._$('pStart').value = p.startDate || '';
    this._$('pPlanned').value = p.plannedCompletion || '';
    this._$('pActual').value = p.actualCompletion || '';
    this._$('pValue').value = p.value || 0;
    this._$('pOpeningBudget').value = p.openingBudget || 0;
    this._$('pDeposit').value = p.depositAmount || 0;
    this._$('pDepositDate').value = p.depositPaidDate || '';
    this._$('pMaterialBudget').value = p.materialBudget || 0;
    this._$('pLabourBudget').value = p.labourBudget || 0;
    this._$('pHourlyRate').value = p.hourlyRate || 0;
    this._$('pEstimatedTime').value = p.estimatedTime || '';
    this._$('pNotes').value = p.notes || '';

    this._syncStatus();
    this._syncBudgetMode();
    this._syncTimeUnit();
    this._renderSpendSummary();
    this._renderQuoteSummary();
    this._renderExpenses();
    this._renderWages();
    this._renderTimeEntries();
    this._renderVariations();
    this._renderSitePhotos();
  }

  _today() {
    return new Date().toISOString().slice(0, 10);
  }

  // ── Autosave ──────────────────────────────────────────────────

  _changed() {
    this._dirty = true;
    this._renderSpendSummary();
    this._renderQuoteSummary();
    this._setSaveState('Unsaved changes');
  }

  _startAutosave() {
    setInterval(() => this._flushSave(), ProjectDetailPage.AUTOSAVE_MS);
    window.addEventListener('beforeunload', () => {
      if (this._dirty) this._flushSave();
    });
    this._setSaveState('');
  }

  async _flushSave() {
    if (!this._dirty || this._saving) return;
    this._saving = true;
    this._dirty = false;
    this._setSaveState('Saving…');
    try {
      // Writes to IndexedDB before attempting the network, so the edit is
      // durable (survives a reload or lost signal) even if the sync below
      // fails - offline is a normal outcome here, not an error.
      const { offline } = await this._jobStore.saveJob(this._job.id, this._job.toJSON());
      if (offline) {
        this._setSaveState('Saved on this device - will sync when back online');
      } else {
        const time = new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
        this._setSaveState(`Saved ${time}`);
      }
    } catch (err) {
      this._dirty = true;
      this._setSaveState(err.message || 'Save failed - retrying');
    } finally {
      this._saving = false;
    }
  }

  _setSaveState(text) {
    this._$('saveState').textContent = text;
  }

  // ── Utility ───────────────────────────────────────────────────

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

new ProjectDetailPage().init();
