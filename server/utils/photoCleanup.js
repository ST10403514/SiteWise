'use strict';

/**
 * Every place a job's JSON blob can reference an uploaded photo/receipt.
 * Used to find R2 objects that need deleting - either because a whole job
 * was removed, or because a save dropped some entries a previous version
 * still referenced.
 * @param {object} data a job's `data` blob
 * @returns {string[]} URLs (R2 URLs only - inline data: fallbacks are skipped,
 *   nothing to delete for those)
 */
function collectPhotoUrls(data) {
  const urls = [];
  const add = (u) => { if (typeof u === 'string' && u.startsWith('http')) urls.push(u); };

  (data?.photos || []).forEach((p) => add(p?.url));
  const project = data?.project;
  if (project) {
    (project.expenses || []).forEach((e) => add(e?.photoUrl));
    (project.staffWages || []).forEach((w) => add(w?.photoUrl));
    (project.slips || []).forEach((s) => add(s?.photoUrl));
    (project.sitePhotos || []).forEach((p) => add(p?.url));
  }
  return urls;
}

module.exports = { collectPhotoUrls };
