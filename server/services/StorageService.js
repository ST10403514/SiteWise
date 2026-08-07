'use strict';

const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

/**
 * StorageService - uploads images to Cloudflare R2 (S3-compatible) and
 * returns their public URL. Also validates that a given URL belongs to our
 * own R2 public bucket (used by the same-origin image proxy).
 */
class StorageService {
  constructor(cfg, client) {
    this._bucket = cfg.bucket;
    this._publicUrl = String(cfg.publicUrl || '').replace(/\/+$/, ''); // strip trailing slash
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
   * True if the URL points at our own R2 public bucket. Guards the image
   * proxy so it can only be used to fetch our own photos, never arbitrary
   * URLs (which would make the server an open proxy / SSRF risk).
   * @param {string} url
   * @returns {boolean}
   */
  isOwnPublicUrl(url) {
    if (!this._publicUrl) return false;
    return typeof url === 'string' && url.startsWith(this._publicUrl + '/');
  }
}

module.exports = StorageService;