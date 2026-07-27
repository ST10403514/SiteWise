'use strict';

/**
 * Job - the single source of truth for one site visit.
 * PDFService reads directly from this model (and its computed getters).
 */
class Job {
  constructor() {
    this.id = (crypto.randomUUID && crypto.randomUUID())
      || `job-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    this.quoteNumber = Job.newQuoteNumber();
    this.date = new Date();
    this.clientName = '';
    this.clientPhone = '';
    this.clientEmail = '';
    this.siteAddress = '';
    this.jobType = null;          // key into Job.JOB_TYPES
    this.methods = new Set();     // keys into Job.METHODS
    this.problemReport = '';
    this.findings = '';
    this.conclusion = '';
    this.outcome = null;          // 'pass' | 'work' | 'monitor'
    this.photos = [];             // { dataUrl, caption, mediaType }
    this.lineItems = [];          // { description, scope, qty, unitPrice, discount }
    this.discount = 0;            // overall %
    this.vatRate = 15;
    this.paymentTerms = '50% deposit, balance on completion';
  }

  /**
   * Chip presets - populated from the tenant's industry at app start
   * via Job.usePresets(). Empty until the profile is applied.
   */
  static JOB_TYPES = {};
  static METHODS = {};
  static QUOTE_PREFIX = 'SW';

  /** @param {string} industryKey key into IndustryPresets.industries */
  static usePresets(industryKey, profile = {}) {
    const industry = IndustryPresets.industry(industryKey);
    Job.JOB_TYPES = { ...industry.jobTypes, ...Job.customMap(profile.customJobTypes) };
    Job.METHODS = { ...industry.methods, ...Job.customMap(profile.customMethods) };
  }

  /** Prefix marking a chip the tenant created themselves. */
  static CUSTOM_PREFIX = 'custom:';

  /**
   * Turn a list of tenant-created labels into a keyed map, matching the
   * shape of the built-in presets so everything downstream (chips, PDFs)
   * treats them identically.
   * @param {string[]} labels
   * @returns {Object<string,string>}
   */
  static customMap(labels) {
    const map = {};
    (Array.isArray(labels) ? labels : []).forEach((label) => {
      map[Job.CUSTOM_PREFIX + label.toLowerCase()] = label;
    });
    return map;
  }

  /** @returns {boolean} true if this chip key was created by the tenant */
  static isCustomKey(key) {
    return typeof key === 'string' && key.startsWith(Job.CUSTOM_PREFIX);
  }

  /** Derive the quote prefix from the company name, e.g. "Atlas Painting Co" -> "APC". */
  static setQuotePrefix(companyName) {
    const initials = (companyName || '')
      .split(/\s+/)
      .map((w) => w[0])
      .filter((c) => c && /[a-zA-Z]/.test(c))
      .join('')
      .toUpperCase()
      .slice(0, 3);
    Job.QUOTE_PREFIX = initials || 'SW';
  }

  static newQuoteNumber() {
    const d = new Date();
    const ymd = d.getFullYear().toString().slice(2)
      + String(d.getMonth() + 1).padStart(2, '0')
      + String(d.getDate()).padStart(2, '0');
    const rand = Math.floor(100 + Math.random() * 900);
    return `${Job.QUOTE_PREFIX}-${ymd}-${rand}`;
  }

  /** South African style: R 12 345.00 */
  /**
   * Normalise a South African (or international) phone number into the
   * digits-only international form WhatsApp expects, e.g.
   *   082 555 0100   -> 27825550100
   *   +27 82 555 0100 -> 27825550100
   *   27825550100    -> 27825550100
   * Returns '' if there aren't enough digits to be a real number.
   * @param {string} raw
   * @returns {string}
   */
  static waNumber(raw) {
    if (!raw) return '';
    let digits = String(raw).replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) digits = digits.slice(1);
    digits = digits.replace(/\D/g, '');
    // Local SA format starting with 0 -> swap for country code 27.
    if (digits.startsWith('0')) digits = '27' + digits.slice(1);
    // Bare 9-digit local (no leading 0) -> assume SA.
    else if (digits.length === 9) digits = '27' + digits;
    return digits.length >= 10 ? digits : '';
  }

  /**
   * Build a wa.me link that opens a chat with the given number,
   * optionally pre-filling a message.
   * @param {string} raw  phone number in any common format
   * @param {string} [message]
   * @returns {string} URL, or '' if the number is unusable
   */
  static waLink(raw, message = '') {
    const num = Job.waNumber(raw);
    if (!num) return '';
    const base = `https://wa.me/${num}`;
    return message ? `${base}?text=${encodeURIComponent(message)}` : base;
  }

  /**
   * South African style: R 12 345.67
   * Built explicitly rather than via toLocaleString, because the en-ZA
   * locale uses a comma as the decimal separator and space as the
   * thousands separator, which is easy to mangle.
   */
  static formatCurrency(value) {
    const n = Number(value) || 0;
    const negative = n < 0;
    const [whole, cents] = Math.abs(n).toFixed(2).split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${negative ? '-' : ''}R ${grouped}.${cents}`;
  }

  get formattedDate() {
    return this.date.toLocaleDateString('en-ZA', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  get jobTypeLabel() { return this.jobType ? Job.JOB_TYPES[this.jobType] : ''; }
  get methodLabels() { return [...this.methods].map((k) => Job.METHODS[k]); }

  /** Line items with their excl-VAT total attached (what PDFService reads). */
  get computedItems() {
    return this.lineItems.map((it) => ({
      ...it,
      totalExcl: (Number(it.qty) || 0) * (Number(it.unitPrice) || 0)
                 * (1 - (Number(it.discount) || 0) / 100),
    }));
  }

  get subtotal()       { return this.computedItems.reduce((s, it) => s + it.totalExcl, 0); }
  get discountAmount() { return this.subtotal * (this.discount / 100); }
  get afterDiscount()  { return this.subtotal - this.discountAmount; }
  get vatAmount()      { return this.afterDiscount * (this.vatRate / 100); }
  get grandTotal()     { return this.afterDiscount + this.vatAmount; }

  /** Plain-object form for the API. */
  toJSON() {
    return {
      quoteNumber: this.quoteNumber,
      date: this.date.toISOString(),
      clientName: this.clientName,
      clientPhone: this.clientPhone,
      clientEmail: this.clientEmail,
      siteAddress: this.siteAddress,
      jobType: this.jobType,
      methods: [...this.methods],
      problemReport: this.problemReport,
      findings: this.findings,
      conclusion: this.conclusion,
      outcome: this.outcome,
      photos: this.photos,
      lineItems: this.lineItems,
      discount: this.discount,
      vatRate: this.vatRate,
      paymentTerms: this.paymentTerms,
      grandTotal: this.grandTotal, // denormalised for dashboard summaries
    };
  }

  /** Rebuild a Job from its API form. @returns {Job} */
  static fromJSON(id, data) {
    const job = new Job();
    job.id = id;
    Object.assign(job, {
      quoteNumber: data.quoteNumber || job.quoteNumber,
      clientName: data.clientName || '',
      clientPhone: data.clientPhone || '',
      clientEmail: data.clientEmail || '',
      siteAddress: data.siteAddress || '',
      jobType: data.jobType || null,
      problemReport: data.problemReport || '',
      findings: data.findings || '',
      conclusion: data.conclusion || '',
      outcome: data.outcome || null,
      photos: Array.isArray(data.photos) ? data.photos : [],
      lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
      discount: Number(data.discount) || 0,
      vatRate: data.vatRate === undefined ? 15 : Number(data.vatRate) || 0,
      paymentTerms: data.paymentTerms || job.paymentTerms,
    });
    job.date = data.date ? new Date(data.date) : new Date();
    job.methods = new Set(Array.isArray(data.methods) ? data.methods : []);
    return job;
  }

  /** Snapshot handed to PDFService - items carry totalExcl. */
  forPdf() {
    const snapshot = Object.create(Object.getPrototypeOf(this));
    Object.assign(snapshot, this, { lineItems: this.computedItems });
    return snapshot;
  }
}

window.Job = Job;