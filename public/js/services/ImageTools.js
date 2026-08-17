'use strict';

/**
 * Client-side image utilities.
 * Everything is downscaled and re-encoded as JPEG so uploads stay small
 * and jsPDF's addImage(..., 'JPEG', ...) always succeeds.
 */
class ImageTools {
  /** Longest edge, in px, for the small companion image used in thumbnail-sized display (ledger rows, photo grids). */
  static THUMB_MAX_DIM = 320;

  /**
   * @param {File} file
   * @param {number} maxDim longest edge in px
   * @param {number} quality JPEG quality 0–1
   * @returns {Promise<string>} data URL
   */
  static compress(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff'; // flatten transparency (PNG logos)
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Could not read that image'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('Could not read that file'));
      reader.readAsDataURL(file);
    });
  }
}

window.ImageTools = ImageTools;
