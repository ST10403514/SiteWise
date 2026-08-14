'use strict';

const ApiError = require('./ApiError');

/**
 * Validates the shape of a job/project save payload. Deliberately tiered:
 * narrative fields (inspection findings, notes) need room to actually
 * describe a job, everything else (names, captions, ids) doesn't.
 *
 * Throws ApiError.badRequest on the first violation. Trims strings and
 * coerces numbers in place on the object it's given.
 */
const SHORT = 200;    // names, addresses, captions, roles, statuses, ids
const MEDIUM = 1000;  // line-item descriptions, payment terms, quote notes
const LONG = 5000;    // problemReport, findings, conclusion, project notes
const DATA_URL = 9_500_000; // matches UploadController.MAX_DATAURL_CHARS + headroom
const MAX_AMOUNT = 100_000_000; // sane ceiling for any single rand figure

const STATUSES = new Set(['planned', 'in_progress', 'completed']);
const BUDGET_MODES = new Set(['total', 'split']);
const OUTCOMES = new Set(['pass', 'work', 'monitor']);

function str(value, field, max, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw ApiError.badRequest(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') throw ApiError.badRequest(`${field} must be text`);
  if (value.length > max) throw ApiError.badRequest(`${field} must be at most ${max} characters`);
  return value;
}

function num(value, field, { max = MAX_AMOUNT, min = 0 } = {}) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) throw ApiError.badRequest(`${field} must be a number`);
  if (n < min || n > max) throw ApiError.badRequest(`${field} is out of range`);
  return n;
}

function arr(value, field, maxItems) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw ApiError.badRequest(`${field} must be a list`);
  if (value.length > maxItems) throw ApiError.badRequest(`${field} can have at most ${maxItems} entries`);
  return value;
}

function photoRef(value, field, storage) {
  // A photo/receipt reference is either an R2 URL (short) or, when an
  // upload failed, an inline base64 fallback (large but bounded).
  const cleaned = str(value, field, DATA_URL);
  // A client that GETs a job back gets a signed URL for display (see
  // photoSigning.js), which may be in a different-looking but equivalent
  // form (raw signed endpoint vs. the canonical public one). Normalize back
  // to the single canonical form so what's persisted - and what the
  // added/removed diff on save compares - is always the same string for
  // the same object.
  if (!cleaned.startsWith('http')) return cleaned;
  return storage ? storage.normalizeUrl(cleaned) : cleaned.split('?')[0];
}

function validateLedgerEntries(entries, field, storage, { nameField } = {}) {
  return arr(entries, field, 500).map((e, i) => {
    if (!e || typeof e !== 'object') throw ApiError.badRequest(`${field}[${i}] is invalid`);
    const out = {
      id: str(e.id, `${field}[${i}].id`, SHORT),
      date: str(e.date, `${field}[${i}].date`, SHORT),
      amount: num(e.amount, `${field}[${i}].amount`),
      photoUrl: e.photoUrl ? photoRef(e.photoUrl, `${field}[${i}].photoUrl`, storage) : null,
    };
    if (nameField) {
      out.name = str(e.name, `${field}[${i}].name`, SHORT);
      out.role = str(e.role, `${field}[${i}].role`, SHORT);
    } else {
      out.description = str(e.description, `${field}[${i}].description`, MEDIUM);
      out.caption = e.caption !== undefined ? str(e.caption, `${field}[${i}].caption`, MEDIUM) : undefined;
    }
    return out;
  });
}

function validateProject(project, storage) {
  if (project === null || project === undefined) return null;
  if (typeof project !== 'object' || Array.isArray(project)) {
    throw ApiError.badRequest('project must be an object');
  }
  if (project.status !== null && project.status !== undefined && !STATUSES.has(project.status)) {
    throw ApiError.badRequest('project.status is invalid');
  }
  if (project.budgetMode !== undefined && project.budgetMode !== null && !BUDGET_MODES.has(project.budgetMode)) {
    throw ApiError.badRequest('project.budgetMode is invalid');
  }
  str(project.startDate, 'project.startDate', SHORT);
  str(project.plannedCompletion, 'project.plannedCompletion', SHORT);
  str(project.actualCompletion, 'project.actualCompletion', SHORT);
  str(project.depositPaidDate, 'project.depositPaidDate', SHORT);
  num(project.staffAtStart, 'project.staffAtStart', { max: 9999 });
  num(project.value, 'project.value');
  num(project.depositAmount, 'project.depositAmount');
  num(project.openingBudget, 'project.openingBudget');
  num(project.materialBudget, 'project.materialBudget');
  num(project.labourBudget, 'project.labourBudget');
  str(project.notes, 'project.notes', LONG);

  project.expenses = validateLedgerEntries(project.expenses, 'project.expenses', storage);
  project.staffWages = validateLedgerEntries(project.staffWages, 'project.staffWages', storage, { nameField: true });
  project.slips = validateLedgerEntries(project.slips, 'project.slips', storage);
  project.sitePhotos = arr(project.sitePhotos, 'project.sitePhotos', 300).map((p, i) => {
    if (!p || typeof p !== 'object') throw ApiError.badRequest(`project.sitePhotos[${i}] is invalid`);
    return {
      id: str(p.id, `project.sitePhotos[${i}].id`, SHORT),
      url: photoRef(p.url, `project.sitePhotos[${i}].url`, storage),
      caption: str(p.caption, `project.sitePhotos[${i}].caption`, MEDIUM),
    };
  });

  return project;
}

/**
 * @param {object} data the full job payload from the client
 * @param {import('../services/StorageService')} [storage] used to normalize
 *   photo/receipt URLs to their canonical form - omit only in contexts with
 *   no storage service available (there are none in this app; always pass it)
 */
function validateJobData(data, storage) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw ApiError.badRequest('Job data is required');
  }

  str(data.quoteNumber, 'Quote number', SHORT, { required: true });
  str(data.clientName, 'Client name', SHORT);
  str(data.clientPhone, 'Client phone', SHORT);
  str(data.clientEmail, 'Client email', SHORT);
  str(data.siteAddress, 'Site address', SHORT);
  str(data.jobType, 'Job type', SHORT);
  if (data.outcome !== null && data.outcome !== undefined && !OUTCOMES.has(data.outcome)) {
    throw ApiError.badRequest('Outcome is invalid');
  }
  str(data.problemReport, 'Problem report', LONG);
  str(data.findings, 'Findings', LONG);
  str(data.conclusion, 'Conclusion', LONG);
  str(data.paymentTerms, 'Payment terms', MEDIUM);
  num(data.discount, 'Discount', { max: 100 });
  num(data.vatRate, 'VAT rate', { max: 100 });
  num(data.grandTotal, 'Grand total');

  arr(data.methods, 'Methods', 50).forEach((m, i) => str(m, `Methods[${i}]`, SHORT));

  data.photos = arr(data.photos, 'Photos', 150).map((p, i) => {
    if (!p || typeof p !== 'object') throw ApiError.badRequest(`Photos[${i}] is invalid`);
    return {
      url: p.url ? photoRef(p.url, `Photos[${i}].url`, storage) : undefined,
      dataUrl: p.dataUrl ? photoRef(p.dataUrl, `Photos[${i}].dataUrl`, storage) : undefined,
      caption: str(p.caption, `Photos[${i}].caption`, MEDIUM),
      mediaType: p.mediaType ? str(p.mediaType, `Photos[${i}].mediaType`, SHORT) : undefined,
    };
  });

  arr(data.lineItems, 'Line items', 300).forEach((it, i) => {
    if (!it || typeof it !== 'object') throw ApiError.badRequest(`Line items[${i}] is invalid`);
    str(it.description, `Line items[${i}].description`, MEDIUM);
    str(it.scope, `Line items[${i}].scope`, MEDIUM);
    num(it.qty, `Line items[${i}].qty`, { max: 1_000_000 });
    num(it.unitPrice, `Line items[${i}].unitPrice`);
    num(it.discount, `Line items[${i}].discount`, { max: 100 });
  });

  validateProject(data.project, storage);

  return data;
}

module.exports = { validateJobData };
