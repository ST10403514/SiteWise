'use strict';

const ApiError = require('../utils/ApiError');
const { validateJobData } = require('../utils/jobValidators');
const { collectPhotoUrls } = require('../utils/photoCleanup');
const { signJobPhotos } = require('../utils/photoSigning');

const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

/** CRUD for a user's saved jobs. */
class JobController {
  constructor({ jobRepository, storageService }) {
    this._jobs = jobRepository;
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
      res.json({ jobs: await this._jobs.listByUser(req.user.id) });
    } catch (err) { next(err); }
  };

  get = async (req, res, next) => {
    try {
      const job = await this._jobs.findByIdForUser(this._id(req.params.id), req.user.id);
      if (!job) throw new ApiError(404, 'Job not found');
      const data = await signJobPhotos(job.data, this._storage);
      res.json({ job: { id: job.id, updatedAt: job.updatedAt, data } });
    } catch (err) { next(err); }
  };

  save = async (req, res, next) => {
    try {
      const id = this._id(req.params.id);
      const data = validateJobData(req.body?.data, this._storage);

      const existing = await this._jobs.findByIdForUser(id, req.user.id);
      const record = await this._jobs.upsert(id, req.user.id, data);

      if (existing) {
        const before = collectPhotoUrls(existing.data);
        const after = collectPhotoUrls(data);
        await this._cleanupRemovedPhotos(before, after);
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
      const existing = await this._jobs.findByIdForUser(id, req.user.id);
      if (!existing) throw new ApiError(404, 'Job not found');

      await this._jobs.removeForUser(id, req.user.id);
      await Promise.all(collectPhotoUrls(existing.data).map((u) => this._storage.deleteObject(u)));

      res.json({ ok: true });
    } catch (err) { next(err); }
  };
}

module.exports = JobController;
