'use strict';

const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl: presignUrl } = require('@aws-sdk/s3-request-presigner');

const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour - long enough for a normal session, short enough to matter

/**
 * StorageService - uploads images to Cloudflare R2 (S3-compatible).
 * uploadDataUrl still returns a stable "canonical" URL in the same shape as
 * before (so nothing stored in Turso needs migrating), but that URL is no
 * longer assumed to be directly fetchable - getSignedUrl() turns it into a
 * short-lived, actually-fetchable one at read time, for use once the bucket
 * itself is switched to private.
 */
class StorageService {
  constructor(cfg, client) {
    this._bucket = cfg.bucket;
    this._publicUrl = String(cfg.publicUrl || '').replace(/\/+$/, ''); // strip trailing slash
    // Presigned URLs are issued against R2's raw S3 API endpoint (virtual-hosted
    // style: bucket.accountId.r2.cloudflarestorage.com), not the public r2.dev
    // domain - a signed URL a client hands back needs to be recognised as ours too.
    this._rawEndpointPrefix = cfg.accountId
      ? `https://${cfg.bucket}.${cfg.accountId}.r2.cloudflarestorage.com`
      : '';
    this._client = client || new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  static parseDataUrl(dataUrl) {
    const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(dataUrl || '');
    if (!m) {
      const err = new Error('Unsupported or invalid image data');
      err.code = 'BAD_IMAGE';
      throw err;
    }
    const rawType = m[1].toLowerCase();
    const contentType = rawType === 'image/jpg' ? 'image/jpeg' : rawType;
    const buffer = Buffer.from(m[2], 'base64');
    const ext = contentType === 'image/png' ? 'png'
      : contentType === 'image/webp' ? 'webp' : 'jpg';
    return { contentType, buffer, ext };
  }

  async uploadDataUrl(dataUrl, prefix = 'photos') {
    const { contentType, buffer, ext } = StorageService.parseDataUrl(dataUrl);
    const cleanPrefix = String(prefix).replace(/^\/+|\/+$/g, '');
    const key = `${cleanPrefix}/${crypto.randomUUID()}.${ext}`;

    await this._client.send(new PutObjectCommand({
      Bucket: this._bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    return `${this._publicUrl}/${key}`;
  }

  /**
   * True if the URL points at one of OUR R2 objects - either the canonical
   * public-looking form (what's stored in Turso) or the raw signed-endpoint
   * form (what a client holds after fetching a job, see photoSigning.js).
   * Guards the image proxy and the delete/sign helpers so they only ever
   * touch our own bucket, never an arbitrary URL (SSRF guard).
   * @param {string} url
   * @returns {boolean}
   */
  isOwnPublicUrl(url) {
    if (typeof url !== 'string') return false;
    return (Boolean(this._publicUrl) && url.startsWith(this._publicUrl + '/'))
      || (Boolean(this._rawEndpointPrefix) && url.startsWith(this._rawEndpointPrefix + '/'));
  }

  /**
   * @param {string} url a URL previously returned by uploadDataUrl or
   *   getSignedUrl - the query string (if any) is stripped first so
   *   re-signing an already-signed URL still targets the right key.
   */
  _keyFromUrl(url) {
    const withoutQuery = url.split('?')[0];
    if (this._publicUrl && withoutQuery.startsWith(this._publicUrl + '/')) {
      return withoutQuery.slice(this._publicUrl.length + 1);
    }
    if (this._rawEndpointPrefix && withoutQuery.startsWith(this._rawEndpointPrefix + '/')) {
      return withoutQuery.slice(this._rawEndpointPrefix.length + 1);
    }
    return withoutQuery;
  }

  /**
   * Delete an object previously returned by uploadDataUrl, given its public
   * URL. Best-effort: only acts on our own bucket (guarded the same way the
   * proxy is) and swallows errors so a cleanup failure never blocks the
   * caller's actual request (a job save/delete, an account deletion).
   * @param {string} url
   */
  async deleteObject(url) {
    if (!this.isOwnPublicUrl(url)) return;
    const key = this._keyFromUrl(url);
    try {
      await this._client.send(new DeleteObjectCommand({ Bucket: this._bucket, Key: key }));
    } catch (err) {
      console.error('Failed to delete R2 object:', key, err.message);
    }
  }

  /**
   * Turn a canonical (possibly-private) object URL into one that's actually
   * fetchable for a limited time. Safe to call on a value that isn't ours -
   * it's returned unchanged.
   * @param {string} url
   * @param {number} [expiresIn] seconds
   * @returns {Promise<string>}
   */
  async getSignedUrl(url, expiresIn = SIGNED_URL_TTL_SECONDS) {
    if (!this.isOwnPublicUrl(url)) return url;
    const key = this._keyFromUrl(url);
    return presignUrl(this._client, new GetObjectCommand({ Bucket: this._bucket, Key: key }), { expiresIn });
  }

  /**
   * Rewrites any URL for one of our own objects - public form or a signed
   * raw-endpoint form a client echoed back from a previous GET - into the
   * single canonical public form. Called on save so the same object is
   * always represented by the exact same string in storage: needed both for
   * consistency and because the added/removed diff on save compares these
   * strings directly (two different-looking URLs for the same object would
   * make a still-referenced photo look "removed" and get deleted).
   * @param {string} url
   * @returns {string}
   */
  normalizeUrl(url) {
    if (typeof url !== 'string' || !this.isOwnPublicUrl(url)) return url;
    return `${this._publicUrl}/${this._keyFromUrl(url)}`;
  }
}

module.exports = StorageService;