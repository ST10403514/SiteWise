'use strict';

/**
 * AppPage - binds the job-card form to the Job model, autosaves it to
 * the tenant's account, and wires the PDF download actions.
 *
 * Opens a saved job when the URL carries ?id=…, otherwise starts fresh.
 */
class AppPage {
  static AUTOSAVE_MS = 2500;

  constructor() {
    this._api = new ApiClient();
    this._guard = new SessionGuard(this._api);
    this._job = null;
    this._dirty = false;
    this._saving = false;
    this._$ = (id) => document.getElementById(id);
    this._toastTimer = null;
  }

  async init() {
    const user = await this._guard.requireOnboardedUser();
    if (!user) return;

    this._applyProfile(user.profile);
    AccountMenu.mount(user);
    this._job = await this._loadOrCreateJob(user.profile);

    this._bindHeader();
    this._bindFields();
    this._buildChips();
    this._bindOutcome();
    this._bindPhotos();
    this._bindItems();
    this._bindDownloads();

    this._hydrate();
    this._startAutosave();
  }

  // ── Tenant profile → theme, presets, header, PDF branding ────

  _applyProfile(profile) {
    Theme.apply(profile.scheme);
    Job.usePresets(profile.industry, profile);
    Job.setQuotePrefix(profile.companyName);
    PDFService.configure(profile);
    this._profile = profile;

    this._$('companyName').textContent = profile.companyName;
    this._$('companyTagline').textContent = profile.tagline || 'Job cards & quotations';
    const logoBox = this._$('companyLogo');
    if (profile.logo) {
      logoBox.innerHTML = `<img src="${profile.logo}" alt="">`;
    } else {
      logoBox.textContent = (profile.companyName || 'S')[0].toUpperCase();
    }
  }

  async _loadOrCreateJob(profile) {
    const id = new URLSearchParams(location.search).get('id');
    if (id) {
      try {
        const { job } = await this._api.getJob(id);
        return Job.fromJSON(job.id, job.data);
      } catch {
        this._toast('Could not open that job - starting a new one');
      }
    }
    const job = new Job();
    job.quoteNumber = Job.newQuoteNumber(); // regenerate with tenant prefix
    job.paymentTerms = profile.paymentTerms || job.paymentTerms;
    history.replaceState(null, '', `/app?id=${job.id}`);
    return job;
  }

  _bindHeader() {
    this._$('logout').addEventListener('click', async () => {
      await this._flushSave();
      await this._api.logout();
      location.replace('/');
    });
    this._$('editProfile').addEventListener('click', () => {
      location.assign('/onboarding');
    });
  }

  // ── Field bindings ────────────────────────────────────────────

  _bind(id, prop, transform = (v) => v) {
    this._$(id).addEventListener('input', (e) => {
      this._job[prop] = transform(e.target.value);
      this._changed();
    });
  }

  _bindFields() {
    const clampPct = (v) => Math.min(100, Math.max(0, Number(v) || 0));
    this._bind('quoteNumber', 'quoteNumber');
    this._bind('clientName', 'clientName');
    this._bind('clientPhone', 'clientPhone');
    this._bind('clientEmail', 'clientEmail');
    this._bind('siteAddress', 'siteAddress');
    this._bind('problemReport', 'problemReport');
    this._bind('findings', 'findings');
    this._bind('conclusion', 'conclusion');
    this._bind('paymentTerms', 'paymentTerms');
    this._bind('globalDiscount', 'discount', clampPct);
    this._bind('vatRate', 'vatRate', clampPct);

    // "Send to client on WhatsApp": show the button only when the client's
    // number looks valid, and open a chat pre-filled with quote details.
    const phoneInput = this._$('clientPhone');
    const waBtn = this._$('waClient');
    const waNote = this._$('waFieldNote');
    const refreshWa = () => {
      const valid = Boolean(Job.waNumber(phoneInput.value));
      waBtn.hidden = !valid;
      if (waNote) waNote.hidden = !valid;
    };
    phoneInput.addEventListener('input', refreshWa);
    waBtn.addEventListener('click', () => this._messageClientOnWhatsApp());
    refreshWa();
  }

  /** Open WhatsApp to the client with a message about their quote. */
  _messageClientOnWhatsApp() {
    const job = this._job;
    const company = this._profile.companyName || 'us';
    const greeting = job.clientName ? `Hi ${job.clientName}, ` : 'Hi, ';
    const total = Job.formatCurrency(job.grandTotal);
    const message =
      `${greeting}thanks for the opportunity to quote. `
      + `Please find your quote ${job.quoteNumber} from ${company}`
      + (job.grandTotal > 0 ? ` for ${total} (incl. VAT).` : '.')
      + ` I'll send the full report and quotation through shortly.`;
    const link = Job.waLink(job.clientPhone, message);
    if (!link) {
      this._toast('Add a valid client phone number first');
      return;
    }
    this._flushSave();
    window.open(link, '_blank');
  }

  // ── Chips ─────────────────────────────────────────────────────

  /**
   * Build a group of selectable chips, followed by an "Add your own"
   * control so the tenant can create presets we did not ship.
   * @param {string} containerId
   * @param {Object<string,string>} map  key -> label
   * @param {'jobType'|'method'} kind
   */
  _buildChipGroup(containerId, map, kind) {
    const box = this._$(containerId);
    const single = kind === 'jobType';
    box.innerHTML = '';

    Object.entries(map).forEach(([key, label]) => {
      box.appendChild(this._buildChip(box, key, label, kind, single));
    });

    box.appendChild(this._buildAddChip(box, kind));
  }

  _buildChip(box, key, label, kind, single) {
    const chip = document.createElement('button');
    chip.className = Job.isCustomKey(key) ? 'chip is-custom' : 'chip';
    chip.type = 'button';
    chip.dataset.key = key;
    chip.setAttribute('aria-pressed', 'false');

    const text = document.createElement('span');
    text.textContent = label;
    chip.appendChild(text);

    chip.addEventListener('click', () => {
      if (single) {
        box.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
      } else {
        const on = chip.getAttribute('aria-pressed') === 'true';
        chip.setAttribute('aria-pressed', String(!on));
      }
      this._applyChipSelection(kind, key, chip.getAttribute('aria-pressed') === 'true');
      this._changed();
    });

    // Tenant-created chips can be removed again.
    if (Job.isCustomKey(key)) {
      const remove = document.createElement('span');
      remove.className = 'chip-x';
      remove.textContent = '\u2715';
      remove.setAttribute('role', 'button');
      remove.setAttribute('aria-label', `Remove ${label}`);
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        this._removeCustomPreset(kind, key, label);
      });
      chip.appendChild(remove);
    }
    return chip;
  }

  /** The "+ Add your own" chip, which swaps into an inline text input. */
  _buildAddChip(box, kind) {
    const add = document.createElement('button');
    add.className = 'chip chip-add';
    add.type = 'button';
    add.textContent = '+ Add your own';
    add.addEventListener('click', () => this._openPresetInput(box, add, kind));
    return add;
  }

  _openPresetInput(box, addChip, kind) {
    addChip.hidden = true;

    const wrap = document.createElement('span');
    wrap.className = 'chip-input';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 60;
    input.placeholder = kind === 'jobType' ? 'e.g. Solar install' : 'e.g. Thermal imaging';

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'chip-save';
    save.textContent = 'Add';

    const close = () => { wrap.remove(); addChip.hidden = false; };

    const commit = async () => {
      const label = input.value.trim().replace(/\s+/g, ' ');
      if (!label) return close();
      save.disabled = true;
      const ok = await this._addCustomPreset(kind, label);
      if (ok) close(); else save.disabled = false;
    };

    save.addEventListener('click', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', () => {
      // Give the Add button a chance to receive the click first.
      setTimeout(() => { if (!wrap.contains(document.activeElement)) close(); }, 150);
    });

    wrap.append(input, save);
    box.insertBefore(wrap, addChip);
    input.focus();
  }

  /**
   * Save a new tenant preset to their profile, then rebuild the chips
   * and select the new one.
   * @returns {Promise<boolean>} whether it saved
   */
  async _addCustomPreset(kind, label) {
    const listKey = kind === 'jobType' ? 'customJobTypes' : 'customMethods';
    const map = kind === 'jobType' ? Job.JOB_TYPES : Job.METHODS;

    const exists = Object.values(map)
      .some((existing) => existing.toLowerCase() === label.toLowerCase());
    if (exists) {
      this._toast(`"${label}" is already in the list`);
      return false;
    }

    const list = [...(this._profile[listKey] || []), label];
    try {
      const { user } = await this._api.savePresets({ [listKey]: list });
      this._profile = user.profile;
      Job.usePresets(this._profile.industry, this._profile);
      this._buildChips();
      // Select the chip they just created.
      const key = Job.CUSTOM_PREFIX + label.toLowerCase();
      this._applyChipSelection(kind, key, true);
      this._syncChipStates();
      this._changed();
      this._toast(`"${label}" saved to your presets`);
      return true;
    } catch (err) {
      this._toast(err.message || 'Could not save that');
      return false;
    }
  }

  /** Remove one of the tenant's own presets from their profile. */
  async _removeCustomPreset(kind, key, label) {
    if (!confirm(`Remove "${label}" from your saved presets?`)) return;
    const listKey = kind === 'jobType' ? 'customJobTypes' : 'customMethods';
    const list = (this._profile[listKey] || [])
      .filter((existing) => existing.toLowerCase() !== label.toLowerCase());
    try {
      const { user } = await this._api.savePresets({ [listKey]: list });
      this._profile = user.profile;
      // Drop it from the current job too, so the PDF stays accurate.
      this._applyChipSelection(kind, key, false);
      Job.usePresets(this._profile.industry, this._profile);
      this._buildChips();
      this._syncChipStates();
      this._changed();
      this._toast(`"${label}" removed`);
    } catch (err) {
      this._toast(err.message || 'Could not remove that');
    }
  }

  /** Route a chip toggle to the right place on the Job model. */
  _applyChipSelection(kind, key, on) {
    if (kind === 'jobType') {
      this._job.jobType = on ? key : null;
      return;
    }
    if (on) this._job.methods.add(key);
    else this._job.methods.delete(key);
  }

  /** Push the Job model's current selections onto the rendered chips. */
  _syncChipStates() {
    const jobBox = this._$('jobTypeChips');
    jobBox.querySelectorAll('.chip').forEach((c) =>
      c.setAttribute('aria-pressed', String(c.dataset.key === this._job.jobType)));

    const methodBox = this._$('methodChips');
    methodBox.querySelectorAll('.chip').forEach((c) =>
      c.setAttribute('aria-pressed', String(this._job.methods.has(c.dataset.key))));
  }

  _buildChips() {
    this._buildChipGroup('jobTypeChips', Job.JOB_TYPES, 'jobType');
    this._buildChipGroup('methodChips', Job.METHODS, 'method');
  }

  _bindOutcome() {
    const box = this._$('outcomes');
    box.querySelectorAll('.outcome').forEach((btn) => {
      btn.addEventListener('click', () => {
        box.querySelectorAll('.outcome').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        this._job.outcome = btn.dataset.k;
        this._changed();
      });
    });
  }

  // ── Hydration (fill the UI from the Job model) ────────────────

  _hydrate() {
    const job = this._job;
    const set = (id, value) => { this._$(id).value = value; };
    set('quoteNumber', job.quoteNumber);
    set('clientName', job.clientName);
    set('clientPhone', job.clientPhone);
    this._$('waClient').hidden = !Job.waNumber(job.clientPhone);
    const note = this._$('waFieldNote');
    if (note) note.hidden = !Job.waNumber(job.clientPhone);
    set('clientEmail', job.clientEmail);
    set('siteAddress', job.siteAddress);
    set('problemReport', job.problemReport);
    set('findings', job.findings);
    set('conclusion', job.conclusion);
    set('paymentTerms', job.paymentTerms);
    set('globalDiscount', job.discount);
    set('vatRate', job.vatRate);

    this._syncChipStates();
    if (job.outcome) {
      const card = this._$('outcomes').querySelector(`[data-k="${job.outcome}"]`);
      if (card) card.setAttribute('aria-pressed', 'true');
    }

    if (!job.lineItems.length) this._addItem({ silent: true });
    this._renderPhotos();
    this._renderItems();
  }

  // ── Photos ────────────────────────────────────────────────────

  _bindPhotos() {
    this._$('photoAdd').addEventListener('click', () => this._$('photoInput').click());
    this._$('photoInput').addEventListener('change', async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      if (!files.length) return;

      this._toast(`Uploading ${files.length} photo${files.length > 1 ? 's' : ''}\u2026`);
      let added = 0;
      for (const file of files) {
        try {
          const dataUrl = await ImageTools.compress(file, 1000, 0.8);
          try {
            // Upload to R2 and store only the URL, so jobs stay small and load fast.
            const { url } = await this._api.uploadPhoto(dataUrl);
            this._job.photos.push({ url, caption: '', mediaType: 'image' });
          } catch (uploadErr) {
            // Upload failed (e.g. no signal on site). Keep the photo locally so
            // it isn't lost - it still displays, and the migration/next save can
            // push it up later. Falls back to the inline data URL.
            this._job.photos.push({ dataUrl, caption: '', mediaType: 'image' });
          }
          added += 1;
          this._renderPhotos();
          this._changed();
        } catch (err) {
          this._toast(err.message || 'Could not add that photo');
        }
      }
      if (added) this._toast(`${added} photo${added > 1 ? 's' : ''} added`);
    });
  }

  _renderPhotos() {
    const grid = this._$('photoGrid');
    grid.querySelectorAll('.photo-cell').forEach((el) => el.remove());
    this._job.photos.forEach((photo, i) => {
      const cell = document.createElement('div');
      cell.className = 'photo-cell';

      const img = document.createElement('img');
      img.src = photo.url || photo.dataUrl;
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
        this._job.photos.splice(i, 1);
        this._renderPhotos();
        this._changed();
      });

      cell.append(img, caption, remove);
      grid.insertBefore(cell, this._$('photoAdd'));
    });
  }

  // ── Line items ────────────────────────────────────────────────

  _addItem(options = {}) {
    this._job.lineItems.push({
      description: '', scope: '', qty: 1, unitPrice: 0, discount: 0,
    });
    this._renderItems();
    if (!options.silent) this._changed();
  }

  _bindItems() {
    this._$('addItem').addEventListener('click', () => this._addItem());
  }

  _renderItems() {
    const tbody = this._$('itemRows');
    tbody.innerHTML = '';
    this._job.lineItems.forEach((item, i) => tbody.appendChild(this._buildRow(item, i)));
    this._renderTotals();
  }

  _buildRow(item, index) {
    const tr = document.createElement('tr');
    const rowTotal = () =>
      (item.qty || 0) * (item.unitPrice || 0) * (1 - (item.discount || 0) / 100);

    const tdDesc = document.createElement('td');
    const desc = document.createElement('input');
    desc.placeholder = 'e.g. Exterior walls - prep & two coats';
    desc.value = item.description;
    desc.addEventListener('input', (e) => { item.description = e.target.value; this._changed(); });
    const scope = document.createElement('input');
    scope.className = 'scope';
    scope.placeholder = 'Scope note (optional)';
    scope.value = item.scope;
    scope.addEventListener('input', (e) => { item.scope = e.target.value; this._changed(); });
    tdDesc.append(desc, scope);

    const totalCell = document.createElement('td');
    totalCell.className = 'rowtotal';
    totalCell.textContent = Job.formatCurrency(rowTotal());

    const numCell = (prop, step) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.className = 'num';
      input.type = 'number';
      input.step = step;
      input.min = '0';
      input.value = item[prop];
      input.addEventListener('input', (e) => {
        item[prop] = Number(e.target.value) || 0;
        totalCell.textContent = Job.formatCurrency(rowTotal());
        this._renderTotals();
        this._changed();
      });
      td.appendChild(input);
      return td;
    };

    const tdDel = document.createElement('td');
    const del = document.createElement('button');
    del.className = 'del';
    del.type = 'button';
    del.textContent = '\u2715';
    del.setAttribute('aria-label', `Remove line ${index + 1}`);
    del.addEventListener('click', () => {
      this._job.lineItems.splice(index, 1);
      this._renderItems();
      this._changed();
    });
    tdDel.appendChild(del);

    tr.append(tdDesc, numCell('qty', '1'), numCell('unitPrice', '0.01'),
              numCell('discount', '0.5'), totalCell, tdDel);
    return tr;
  }

  // ── Totals ────────────────────────────────────────────────────

  _renderTotals() {
    const job = this._job;
    const rows = [];
    if (job.discount > 0) {
      rows.push(['Subtotal (excl. VAT)', Job.formatCurrency(job.subtotal)]);
      rows.push([`Discount (${job.discount}%)`, `-${Job.formatCurrency(job.discountAmount)}`]);
    }
    rows.push(['After discount (excl. VAT)', Job.formatCurrency(job.afterDiscount)]);
    rows.push([`VAT (${job.vatRate}%)`, Job.formatCurrency(job.vatAmount)]);

    this._$('totals').innerHTML = rows
      .map(([label, value]) => `<div class="row"><span>${label}</span><span>${value}</span></div>`)
      .join('')
      + `<div class="row grand"><span>Total due (incl. VAT)</span>`
      + `<span>${Job.formatCurrency(job.grandTotal)}</span></div>`;

    this._$('liveTotal').textContent = Job.formatCurrency(job.grandTotal);
  }

  // ── Autosave ──────────────────────────────────────────────────

  _changed() {
    this._dirty = true;
    this._renderTotals();
    this._setSaveState('Unsaved changes');
  }

  _startAutosave() {
    setInterval(() => this._flushSave(), AppPage.AUTOSAVE_MS);
    window.addEventListener('beforeunload', () => {
      // Best effort - a save is likely already in flight from the interval.
      if (this._dirty) this._flushSave();
    });
    this._setSaveState('');
  }

  async _flushSave() {
    if (!this._dirty || this._saving) return;
    this._saving = true;
    this._dirty = false;
    this._setSaveState('Saving\u2026');
    try {
      await this._api.saveJob(this._job.id, this._job.toJSON());
      const time = new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
      this._setSaveState(`Saved ${time}`);
    } catch {
      this._dirty = true; // retry on next tick
      this._setSaveState('Save failed - retrying');
    } finally {
      this._saving = false;
    }
  }

  _setSaveState(text) {
    this._$('saveState').textContent = text;
  }

  // ── Downloads ─────────────────────────────────────────────────

  _hasQuotableItems() {
    if (this._job.lineItems.some((it) => it.description.trim())) return true;
    this._toast('Add at least one line item with a description first');
    return false;
  }

  /**
   * Reports carry site photos. If none were taken, check the user meant
   * to leave them out rather than silently producing a photo-less report.
   * Remembered for the session so they are only asked once.
   * @returns {boolean} whether to continue
   */
  _confirmNoPhotos() {
    const hasPhotos = (this._job.photos || [])
      .some((p) => p.mediaType !== 'video');
    if (hasPhotos || this._photosWaived) return true;

    const proceed = confirm(
      'No site photos have been added to this job card.\n\n'
      + 'Photos back up your findings and appear in the report.\n\n'
      + 'OK  =  continue without photos\n'
      + 'Cancel  =  go back and add photos',
    );
    if (proceed) {
      this._photosWaived = true;
      return true;
    }
    this._$('photoGrid').scrollIntoView({ behavior: 'smooth', block: 'center' });
    this._toast('Add photos, then generate the PDF again');
    return false;
  }

  _bindDownloads() {
    this._$('dlReport').addEventListener('click', () => {
      if (!this._confirmNoPhotos()) return;
      this._flushSave();
      PDFService.downloadReport(this._job.forPdf());
      this._toast('Report PDF downloaded');
    });
    this._$('dlQuote').addEventListener('click', () => {
      if (!this._hasQuotableItems()) return;
      this._flushSave();
      PDFService.downloadQuote(this._job.forPdf());
      this._toast('Quote PDF downloaded');
    });
    this._$('dlFull').addEventListener('click', () => {
      if (!this._hasQuotableItems()) return;
      if (!this._confirmNoPhotos()) return;
      this._flushSave();
      PDFService.downloadFull(this._job.forPdf());
      this._toast('Full report + quote downloaded');
    });
  }

  // ── Toast ─────────────────────────────────────────────────────

  _toast(message) {
    const toast = this._$('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }
}

new AppPage().init();