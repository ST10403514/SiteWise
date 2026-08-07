'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Photo upload + same-origin image proxy.
 *
 *  - create: receives a compressed base64 image, stores it in R2, returns URL.
 *  - proxy:  fetches one of OUR R2 images server-side and streams it back from
 *            our own origin, so the browser (PDF canvas) never makes a
 *            cross-origin request. Sidesteps R2's r2.dev CORS limitation.
 */
class UploadController {
  constructor({ storageService }) {
    this._storage = storageService;
  }

  static MAX_DATAURL_CHARS = 9_000_000;

  create = async (req, res, next) => {
    try {
      const dataUrl = req.body?.dataUrl;
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        throw ApiError.badRequest('An image is required');
      }
      if (dataUrl.length > UploadController.MAX_DATAURL_CHARS) {
        throw ApiError.badRequest('Image is too large');
      }
      const url = await this._storage.uploadDataUrl(dataUrl, `photos/${req.user.id}`);
      res.status(201).json({ url });
    } catch (err) {
      if (err.code === 'BAD_IMAGE') return next(ApiError.badRequest('Unsupported image format'));
      next(err);
    }
  };

  proxy = async (req, res, next) => {
    try {
      const url = req.query?.url;
      // Only proxy our own R2 images - never an arbitrary URL (SSRF guard).
      if (!this._storage.isOwnPublicUrl(url)) {
        throw ApiError.badRequest('Invalid image URL');
      }
      const upstream = await fetch(url);
      if (!upstream.ok) {
        throw new ApiError(502, 'Could not fetch image');
      }
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = UploadController;