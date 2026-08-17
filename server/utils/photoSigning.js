'use strict';

/**
 * Returns a copy of a job's `data` blob with every stored R2 photo/receipt
 * URL swapped for a freshly-signed, time-limited one, ready to hand to a
 * client. Leaves inline data: URL fallbacks and anything that isn't ours
 * untouched (storageService.getSignedUrl is a no-op for those).
 * @param {object} data
 * @param {import('../services/StorageService')} storage
 * @returns {Promise<object>}
 */
async function signJobPhotos(data, storage) {
  if (!data) return data;
  const sign = async (url) => (url ? storage.getSignedUrl(url) : url);

  const photos = await Promise.all(
    (data.photos || []).map(async (p) => ({
      ...p,
      url: p?.url ? await sign(p.url) : p?.url,
      thumbUrl: p?.thumbUrl ? await sign(p.thumbUrl) : p?.thumbUrl,
    })),
  );

  let project = data.project;
  if (project) {
    const [expenses, staffWages, sitePhotos] = await Promise.all([
      Promise.all((project.expenses || []).map(async (e) => ({
        ...e,
        photoUrl: e?.photoUrl ? await sign(e.photoUrl) : e?.photoUrl,
        photoThumbUrl: e?.photoThumbUrl ? await sign(e.photoThumbUrl) : e?.photoThumbUrl,
      }))),
      Promise.all((project.staffWages || []).map(async (w) => ({
        ...w,
        photoUrl: w?.photoUrl ? await sign(w.photoUrl) : w?.photoUrl,
        photoThumbUrl: w?.photoThumbUrl ? await sign(w.photoThumbUrl) : w?.photoThumbUrl,
      }))),
      Promise.all((project.sitePhotos || []).map(async (p) => ({
        ...p,
        url: p?.url ? await sign(p.url) : p?.url,
        thumbUrl: p?.thumbUrl ? await sign(p.thumbUrl) : p?.thumbUrl,
      }))),
    ]);
    project = { ...project, expenses, staffWages, sitePhotos };
  }

  return { ...data, photos, project };
}

module.exports = { signJobPhotos };
