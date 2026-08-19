'use strict';

const DATA_URL_RE = /^data:image\//;

/**
 * Returns a copy of a job's `data` blob with any embedded data:image/...
 * photo/receipt reference (the offline/upload-failure fallback used to
 * avoid losing a photo) replaced by a real R2 upload - so a job settles
 * back to "every photo is an R2 URL" regardless of whether it was captured
 * online or offline. Runs on every save, not just ones synced from an
 * offline queue, so a transient upload failure while online self-heals
 * the same way. A failed upload here just leaves the field embedded
 * rather than losing the photo - never throws.
 * @param {object} data validated job data
 * @param {import('../services/StorageService')} storage
 * @param {string} businessId scopes the R2 key, matching UploadController's
 *   convention - a business's uploads, not an individual login's, since any
 *   team member can save the same shared job.
 * @returns {Promise<object>}
 */
async function migrateInlinePhotos(data, storage, businessId) {
  if (!data) return data;

  const upload = async (dataUrl, folder) => {
    if (typeof dataUrl !== 'string' || !DATA_URL_RE.test(dataUrl)) return null;
    try {
      return await storage.uploadDataUrl(dataUrl, `${folder}/${businessId}`);
    } catch {
      return null;
    }
  };

  // job.photos uses a different field (dataUrl) for the embedded fallback
  // than for a real upload (url) - everywhere else reuses the same field
  // for both, since there's nothing else stored alongside it that needs
  // to survive a failed migration attempt.
  const photos = await Promise.all((data.photos || []).map(async (p) => {
    if (!p?.dataUrl) return p;
    const url = await upload(p.dataUrl, 'photos');
    if (!url) return p;
    const { dataUrl, ...rest } = p;
    return { ...rest, url };
  }));

  let project = data.project;
  if (project) {
    const [expenses, staffWages, sitePhotos] = await Promise.all([
      Promise.all((project.expenses || []).map(async (e) => {
        const url = await upload(e?.photoUrl, 'expenses');
        return url ? { ...e, photoUrl: url } : e;
      })),
      Promise.all((project.staffWages || []).map(async (w) => {
        const url = await upload(w?.photoUrl, 'wages');
        return url ? { ...w, photoUrl: url } : w;
      })),
      Promise.all((project.sitePhotos || []).map(async (p) => {
        const url = await upload(p?.url, 'site-photos');
        return url ? { ...p, url } : p;
      })),
    ]);
    project = { ...project, expenses, staffWages, sitePhotos };
  }

  return { ...data, photos, project };
}

module.exports = { migrateInlinePhotos };
