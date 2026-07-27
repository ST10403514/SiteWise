'use strict';

const ApiError = require('../utils/ApiError');
const v = require('../utils/validators');

const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

/** CRUD for a user's saved jobs. */
class JobController {
  constructor({ jobRepository }) {
    this._jobs = jobRepository;
  }

  _id(raw) {
    if (typeof raw !== 'string' || !ID_RE.test(raw)) {
      throw ApiError.badRequest('Invalid job id');
    }
    return raw;
  }

  list = (req, res) => {
    res.json({ jobs: this._jobs.listByUser(req.user.id) });
  };

  get = (req, res, next) => {
    try {
      const job = this._jobs.findByIdForUser(this._id(req.params.id), req.user.id);
      if (!job) throw new ApiError(404, 'Job not found');
      res.json({ job: { id: job.id, updatedAt: job.updatedAt, data: job.data } });
    } catch (err) { next(err); }
  };

  save = (req, res, next) => {
    try {
      const id = this._id(req.params.id);
      const data = req.body?.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw ApiError.badRequest('Job data is required');
      }
      v.requireString(data.quoteNumber, 'Quote number', { max: 60 });
      const record = this._jobs.upsert(id, req.user.id, data);
      res.json({ job: { id: record.id, updatedAt: record.updatedAt } });
    } catch (err) {
      if (err.code === 'FORBIDDEN') return next(new ApiError(403, 'Not your job'));
      next(err);
    }
  };

  remove = (req, res, next) => {
    try {
      const removed = this._jobs.removeForUser(this._id(req.params.id), req.user.id);
      if (!removed) throw new ApiError(404, 'Job not found');
      res.json({ ok: true });
    } catch (err) { next(err); }
  };
}

module.exports = JobController;
