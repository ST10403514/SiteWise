'use strict';

const ApiError = require('../utils/ApiError');
const { validateJobData } = require('../utils/jobValidators');
const { collectPhotoUrls } = require('../utils/photoCleanup');
const { signJobPhotos } = require('../utils/photoSigning');
const { migrateInlinePhotos } = require('../utils/photoMigration');

const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

/** CRUD for a business's saved jobs - shared by every team member on it. */
class JobController {
  constructor({ jobRepository, businessRepository, storageService }) {
    this._jobs = jobRepository;
    this._businesses = businessRepository;
    this._storage = storageService;
  }

  _id(raw) {
    if (typeof raw !== 'string' || !ID_RE.test(raw)) {
      throw ApiError.badRequest('Invalid job id');
    }
    return raw;
  }

  /** Delete any R2 objects that `beforeUrls` referenced but `afterUrls` no longer does. */
  async _cleanupRemovedPhotos(beforeUrls, afterUrls) {
    const afterSet = new Set(afterUrls);
    const removed = beforeUrls.filter((u) => !afterSet.has(u));
    await Promise.all(removed.map((u) => this._storage.deleteObject(u)));
  }

  list = async (req, res, next) => {
    try {
      res.json({ jobs: await this._jobs.listByBusiness(req.user.businessId) });
    } catch (err) { next(err); }
  };

  get = async (req, res, next) => {
    try {
      const job = await this._jobs.findByIdForBusiness(this._id(req.params.id), req.user.businessId);
      if (!job) throw new ApiError(404, 'Job not found');
      const data = await signJobPhotos(job.data, this._storage);
      res.json({ job: { id: job.id, updatedAt: job.updatedAt, data } });
    } catch (err) { next(err); }
  };

  save = async (req, res, next) => {
    try {
      const id = this._id(req.params.id);
      const data = validateJobData(req.body?.data, this._storage);
      // Swaps any embedded data:image/... fallback (from an offline or
      // failed upload) for a real R2 upload before it's persisted, so a
      // job never permanently settles on a bloated, uncacheable inline copy.
      const migrated = await migrateInlinePhotos(data, this._storage, req.user.businessId);

      const existing = await this._jobs.findByIdForBusiness(id, req.user.businessId);

      // Only a genuine new job counts against the free plan's monthly cap -
      // req.user.jobQuota was already computed once in requireAuth from the
      // same business row, so this needs no extra query. An update
      // (autosave on an existing job) is never blocked, no matter the tier.
      if (!existing && req.user.jobQuota?.atCap) {
        throw new ApiError(402, `You've used all ${req.user.jobQuota.cap} free job cards this month - upgrade to Solo for unlimited.`);
      }

      const record = await this._jobs.upsert(id, { businessId: req.user.businessId, userId: req.user.id }, migrated);

      if (existing) {
        const before = collectPhotoUrls(existing.data);
        const after = collectPhotoUrls(migrated);
        await this._cleanupRemovedPhotos(before, after);
      } else {
        await this._businesses.incrementMonthlyJobCount(req.user.businessId);
      }

      res.json({ job: { id: record.id, updatedAt: record.updatedAt } });
    } catch (err) {
      if (err.code === 'FORBIDDEN') return next(new ApiError(403, 'Not your job'));
      next(err);
    }
  };

  remove = async (req, res, next) => {
    try {
      const id = this._id(req.params.id);
      const existing = await this._jobs.findByIdForBusiness(id, req.user.businessId);
      if (!existing) throw new ApiError(404, 'Job not found');

      await this._jobs.removeForBusiness(id, req.user.businessId);
      await Promise.all(collectPhotoUrls(existing.data).map((u) => this._storage.deleteObject(u)));

      res.json({ ok: true });
    } catch (err) { next(err); }
  };
}

module.exports = JobController;
