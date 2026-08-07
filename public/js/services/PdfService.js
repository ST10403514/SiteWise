'use strict';

/**
 * PDFService - generates branded PDF documents using jsPDF.
 *
 * Produces:
 *   - Full document: report findings + quotation (2–3 pages)
 *   - Quote only: 1–2 pages
 *   - Report only: 1–2 pages
 *
 * Branding (company name, tagline, VAT, banking, logo) comes from the
 * signed-in user's company profile via PDFService.configure(profile).
 */
class PDFService {
  // ── Page geometry (mm) ────────────────────────────────────────
  static PW   = 210;   // page width
  static PH   = 297;   // page height
  static ML   = 14;    // margin left
  static MR   = 14;    // margin right
  static MT   = 14;    // margin top
  static MB   = 14;    // margin bottom
  static CW   = 210 - 14 - 14; // content width = 182mm

  // ── Brand colours ─────────────────────────────────────────────
  static NAVY  = [35, 49, 84];     // #233154
  static BLUE  = [37,  99,  235];  // #2563eb
  static WHITE = [255, 255, 255];
  static LGRAY = [248, 250, 252];  // light bg
  static MGRAY = [100, 116, 139];  // muted text
  static DTEXT = [30,  41,  59];   // dark text

  // ── Chip colours (retinted by the tenant's scheme) ────────────
  static CHIP_BG   = [239, 246, 255];
  static CHIP_LINE = [191, 219, 254];
  static CHIP_INK  = [29, 78, 216];

  // ── Company profile (defaults; overridden by configure) ───────
  static PROFILE = {
    companyName: 'Your Company',
    tagline: '',
    email: '',
    city: '',
    addressLine: '',
    phone: '',
    whatsapp: '',
    website: '',
    regNumber: '',
    vatNumber: '',
    quoteValidity: '',
    quoteNotes: '',
    bankName: '',
    bankHolder: '',
    bankAccount: '',
    branchCode: '',
    scheme: 'slate',
    logo: '',
  };

  /**
   * Apply the signed-in tenant's company profile to all future PDFs -
   * name, banking, logo AND brand colours from their chosen scheme.
   */
  static configure(profile) {
    if (!profile) return;
    // Drop undefined/null fields so they can't overwrite the safe defaults
    // above (a missing companyName would otherwise reach doc.text as undefined
    // and crash jsPDF with "Invalid arguments").
    const clean = {};
    for (const [k, v] of Object.entries(profile)) {
      if (v !== undefined && v !== null) clean[k] = v;
    }
    PDFService.PROFILE = { ...PDFService.PROFILE, ...clean };
    const scheme = IndustryPresets.scheme(PDFService.PROFILE.scheme);
    PDFService.NAVY      = Theme.rgb(scheme.primary);
    PDFService.BLUE      = Theme.rgb(scheme.accent);
    PDFService.CHIP_BG   = Theme.rgb(scheme.accentMist);
    PDFService.CHIP_LINE = Theme.rgb(scheme.accentLine);
    PDFService.CHIP_INK  = Theme.rgb(scheme.accentInk);
  }

  /**
   * Generate and download a full PDF (report + quote).
   * @param {Job} job
   */
  static async downloadFull(job) {
    // Photos are stored as R2 URLs; pull them into inline data URLs first so
    // the synchronous jsPDF drawing below has image data to work with.
    job = await PDFService._withResolvedPhotos(job);
    const doc = PDFService._createDoc();
    let y = PDFService._addHeader(doc, job, 'REPORT & QUOTATION');
    y = PDFService._addReportSection(doc, job, y);
    y = PDFService._addPhotos(doc, job, y);
    PDFService._startNewPage(doc);
    const y2 = PDFService._addHeader(doc, job, 'QUOTATION');
    PDFService._addQuoteSection(doc, job, y2);
    PDFService._addPageNumbers(doc);
    doc.save(`${job.quoteNumber}-full.pdf`);
  }

  /** Generate and download a quote-only PDF. @param {Job} job */
  static downloadQuote(job) {
    const doc = PDFService._createDoc();
    const y = PDFService._addHeader(doc, job, 'QUOTATION');
    PDFService._addQuoteSection(doc, job, y);
    PDFService._addPageNumbers(doc);
    doc.save(`${job.quoteNumber}-quote.pdf`);
  }

  /** Generate and download a report-only PDF. @param {Job} job */
  static async downloadReport(job) {
    job = await PDFService._withResolvedPhotos(job);
    const doc = PDFService._createDoc();
    let y = PDFService._addHeader(doc, job, 'SITE INSPECTION REPORT');
    y = PDFService._addReportSection(doc, job, y);
    PDFService._addPhotos(doc, job, y);
    PDFService._addPageNumbers(doc);
    doc.save(`${job.quoteNumber}-report.pdf`);
  }

  // ── Private builders ──────────────────────────────────────────

  static _createDoc() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  }

  /**
   * Draw branded header. Returns Y position after header.
   * @returns {number} Y after header
   */
  static _addHeader(doc, job, docType) {
    const { ML, MR, PW, NAVY, BLUE, WHITE, MGRAY, DTEXT, PROFILE } = PDFService;

    // Navy bar
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PW, 38, 'F');

    // Blue accent stripe
    doc.setFillColor(...BLUE);
    doc.rect(0, 38, PW, 2, 'F');

    // Logo (if configured) - scaled to fit a 28mm box, preserving aspect ratio
    if (PROFILE.logo) {
      try {
        const box = 28;            // the logo slot is 28mm x 28mm
        const boxY = 5;            // top offset, unchanged
        let drawW = box, drawH = box;

        // Read the image's real dimensions so we can keep its shape.
        const props = doc.getImageProperties(PROFILE.logo);
        if (props && props.width && props.height) {
          const ratio = props.width / props.height;
          if (ratio >= 1) {
            drawW = box;           // wider than tall
            drawH = box / ratio;
          } else {
            drawH = box;           // taller than wide
            drawW = box * ratio;
          }
        }

        // Centre the scaled logo within the 28mm slot.
        const offX = ML + (box - drawW) / 2;
        const offY = boxY + (box - drawH) / 2;

        doc.addImage(PROFILE.logo, offX, offY, drawW, drawH);
      } catch (_) {}
    }

    // Company name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...WHITE);
    doc.text(PROFILE.companyName, 46, 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(180, 195, 220);
    if (PROFILE.tagline) doc.text(PROFILE.tagline, 46, 19.5);

    // Contact line
    doc.setFontSize(7.5);
    doc.setTextColor(160, 175, 200);
    doc.text(
      [PROFILE.email, PROFILE.phone,
       PROFILE.whatsapp ? `WhatsApp ${PROFILE.whatsapp}` : '',
       PROFILE.website].filter(Boolean).join('  |  '),
      46, 25,
    );

    // Doc type badge (top-right)
    const badgeX = PW - MR - 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...WHITE);
    doc.text(docType, badgeX, 16, { align: 'right' });

    // Quote number
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(180, 195, 220);
    doc.text(String(job.quoteNumber || ''), badgeX, 23, { align: 'right' });
    doc.text(String(job.formattedDate || ''), badgeX, 29, { align: 'right' });

    let y = 50;

    // FROM / TO block
    const colW = (PDFService.CW - 6) / 2;
    const col2X = ML + colW + 6;

    // FROM
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MGRAY);
    doc.text('FROM', ML, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...DTEXT);
    doc.text(PROFILE.companyName, ML, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MGRAY);
    // Full company details, only printing the lines that were filled in.
    const fromLines = [
      PROFILE.addressLine,
      PROFILE.city,
      PROFILE.phone ? `Tel: ${PROFILE.phone}` : '',
      PROFILE.regNumber ? `Reg: ${PROFILE.regNumber}` : '',
      PROFILE.vatNumber ? `VAT: ${PROFILE.vatNumber}` : '',
    ].filter(Boolean);
    fromLines.forEach((line, i) => doc.text(line, ML, y + 10 + i * 4.4));

    // TO
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MGRAY);
    doc.text('TO', col2X, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...DTEXT);
    doc.text(job.clientName || '-', col2X, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MGRAY);

    const addrLines = doc.splitTextToSize(job.siteAddress || '', colW);
    const shownAddr = addrLines.slice(0, 2);
    shownAddr.forEach((line, i) => doc.text(line, col2X, y + 10 + i * 4.4));
    let toY = y + 10 + shownAddr.length * 4.4;
    if (job.clientPhone) { doc.text(job.clientPhone, col2X, toY); toY += 4.4; }
    if (job.clientEmail) { doc.text(job.clientEmail, col2X, toY); toY += 4.4; }

    // Divider sits below whichever column ran longer.
    const fromY = y + 10 + fromLines.length * 4.4;
    y = Math.max(fromY, toY, y + 20) + 4;
    doc.setDrawColor(226, 232, 240);
    doc.line(ML, y, PW - MR, y);

    return y + 7;
  }

  /** Draw the report/findings section. Returns new Y. */
  static _addReportSection(doc, job, startY) {
    const { ML, NAVY, DTEXT, MGRAY, CW } = PDFService;
    let y = startY;

    const checkPage = (needed) => {
      if (y + needed > 280) {
        doc.addPage();
        y = PDFService.MT;
      }
    };

    const sectionTitle = (label) => {
      checkPage(12);
      doc.setFillColor(...PDFService.BLUE);
      doc.rect(ML, y, 3, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...NAVY);
      doc.text(label.toUpperCase(), ML + 6, y + 4.5);
      y += 10;
    };

    const bodyText = (text) => {
      if (!text) return;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...DTEXT);
      const lines = doc.splitTextToSize(text, CW);
      lines.forEach((line) => {
        checkPage(6);
        doc.text(line, ML, y);
        y += 5;
      });
      y += 3;
    };

    /**
     * Draw a row of pill-shaped chips that wrap onto new lines as needed,
     * matching the web app's chip styling (light blue fill, blue border,
     * blue text, fully rounded ends).
     * @param {string[]} labels
     */
    const chipRow = (labels) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const chipH = 6.5;
      const padX = 3;
      const gap = 2.5;
      let x = ML;
      checkPage(chipH + 2);
      labels.forEach((label) => {
        const textW = doc.getTextWidth(label);
        const chipW = textW + padX * 2;
        if (x + chipW > ML + CW) {
          x = ML;
          y += chipH + gap;
          checkPage(chipH + 2);
        }
        doc.setFillColor(...PDFService.CHIP_BG);
        doc.setDrawColor(...PDFService.CHIP_LINE);
        doc.setLineWidth(0.25);
        doc.roundedRect(x, y, chipW, chipH, chipH / 2, chipH / 2, 'FD');
        doc.setTextColor(...PDFService.CHIP_INK);
        doc.text(label, x + padX, y + chipH / 2 + 1.4);
        x += chipW + gap;
      });
      y += chipH + 6;
    };

    if (job.jobTypeLabel) {
      sectionTitle('Job type');
      chipRow([job.jobTypeLabel]);
    }

    if (job.methodLabels && job.methodLabels.length) {
      sectionTitle('Methods used');
      chipRow(job.methodLabels);
    }

    if (job.problemReport) {
      sectionTitle('Problem reported');
      bodyText(job.problemReport);
    }

    if (job.findings) {
      sectionTitle('Inspection findings');
      bodyText(job.findings);
    }

    if (job.conclusion) {
      sectionTitle('Conclusion & recommendation');
      bodyText(job.conclusion);
    }

    // Outcome badge
    if (job.outcome) {
      checkPage(14);
      const colours = {
        pass:    { bg: [240, 253, 244], border: [187, 247, 208], text: [22, 163, 74]  },
        work:    { bg: [255, 251, 235], border: [253, 230, 138], text: [217, 119, 6]  },
        monitor: { bg: [240, 249, 255], border: [186, 230, 253], text: [2, 132, 199]  },
      };
      const labels = {
        pass:    'Pass - No further action required',
        work:    'Further work required',
        monitor: 'Monitor - review in 30 days',
      };
      const c = colours[job.outcome] || colours.pass;
      const label = labels[job.outcome] || job.outcome;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      const textW = doc.getTextWidth(label);
      const padX = 5;
      const badgeH = 9;
      const badgeW = textW + padX * 2;

      doc.setFillColor(...c.bg);
      doc.setDrawColor(...c.border);
      doc.setLineWidth(0.3);
      doc.roundedRect(ML, y, badgeW, badgeH, 2, 2, 'FD');
      doc.setTextColor(...c.text);
      doc.text(label, ML + padX, y + badgeH / 2 + 1.6);
      y += badgeH + 6;
    }

    return y;
  }

  /** Draw photos 3-up, matching the web app's photo grid. Returns new Y. */
  static _addPhotos(doc, job, startY) {
    // PDFs can't embed playable video - filter to still photos only
    const photos = (job.photos || []).filter((p) => p.mediaType !== 'video');
    if (!photos.length) return startY;

    const { ML, CW, MGRAY } = PDFService;
    let y = startY;

    // Photos now have a page to themselves, so show them larger.
    // Few photos get a roomy 2-up grid; larger sets fall back to 3-up.
    const cols = photos.length <= 6 ? 2 : 3;
    const gap = 6;
    const imgW = (CW - gap * (cols - 1)) / cols;
    const imgH = imgW * 0.72;
    const captionH = 7;
    const cellH = imgH + captionH + 4;
    const titleH = 12;
    const BOTTOM = 278;

    // Site photos get their own page so the whole set stays together.
    // When a job has no photos this is never called, so no blank page
    // is produced and the document stays tight.
    doc.addPage();
    y = PDFService.MT;

    // Section title
    doc.setFillColor(...PDFService.BLUE);
    doc.rect(ML, y, 3, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PDFService.NAVY);
    doc.text('SITE PHOTOS', ML + 6, y + 4.5);
    y += titleH;

    photos.forEach((photo, idx) => {
      const col = idx % cols;
      if (col === 0 && idx !== 0) {
        y += cellH + 4;
        if (y + cellH > BOTTOM) {
          doc.addPage();
          y = PDFService.MT;
        }
      }

      const x = ML + col * (imgW + gap);

      // Border
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(x - 1, y - 1, imgW + 2, imgH + captionH + 3, 2, 2);

      // Image
      if (photo.dataUrl) {
        try {
          doc.addImage(photo.dataUrl, 'JPEG', x, y, imgW, imgH);
        } catch (_) {
          doc.setFillColor(248, 250, 252);
          doc.rect(x, y, imgW, imgH, 'F');
        }
      }

      // Caption
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MGRAY);
      const cap = doc.splitTextToSize(photo.caption || `Photo ${idx + 1}`, imgW)[0];
      doc.text(cap, x + imgW / 2, y + imgH + 4, { align: 'center' });
    });

    return y + cellH + 8;
  }

  /**
   * Return a copy of the job whose photos all carry an inline `dataUrl`.
   * New photos are stored as R2 URLs; older ones may still have `dataUrl`.
   * Each URL photo is fetched and converted to a JPEG data URL (jsPDF draws
   * data URLs, not remote URLs). Photos that fail to load are left as-is, so
   * _addPhotos simply draws their empty frame + caption rather than crashing.
   * @param {Job} job
   * @returns {Promise<object>} job-like object with resolved photos
   */
  static async _withResolvedPhotos(job) {
    const photos = job.photos || [];
    const resolved = await Promise.all(photos.map(async (p) => {
      if (p.mediaType === 'video') return p; // filtered out later anyway
      if (p.dataUrl) return p;               // already inline
      if (!p.url) return p;                  // nothing to load
      try {
        const dataUrl = await PDFService._urlToJpegDataUrl(p.url);
        return { ...p, dataUrl };
      } catch (_) {
        return p; // leave without dataUrl; frame + caption still render
      }
    }));
    // Preserve the Job instance's prototype so its computed getters
    // (subtotal, vatAmount, grandTotal, formattedDate, ...) still work.
    // A plain { ...job } spread would drop those getters and zero the totals.
    const clone = Object.assign(Object.create(Object.getPrototypeOf(job)), job);
    clone.photos = resolved;
    return clone;
  }

  /**
   * Load an image URL (CORS-enabled) and re-encode it to a JPEG data URL via
   * canvas, so jsPDF can embed it. Requires the R2 bucket's CORS policy to
   * allow GET from this origin.
   * @param {string} url
   * @returns {Promise<string>} JPEG data URL
   */
  static _urlToJpegDataUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Load through our own same-origin proxy so the canvas is not tainted and
      // no cross-origin CORS request is made (r2.dev doesn't serve CORS headers).
      const src = '/api/uploads/proxy?url=' + encodeURIComponent(url);
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Could not load image ' + url));
      img.src = src;
    });
  }

  /** Draw the quotation line items and totals. */
  static _addQuoteSection(doc, job, startY) {
    const { ML, NAVY, LGRAY, MGRAY, DTEXT, CW, PROFILE } = PDFService;
    let y = startY;

    // Table header
    doc.setFillColor(...NAVY);
    doc.rect(ML, y, CW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);

    const cols = [
      { label: 'Description', x: ML + 2,    align: 'left',  width: 82 },
      { label: 'Qty',         x: ML + 86,   align: 'right', width: 14 },
      { label: 'Unit price',  x: ML + 104,  align: 'right', width: 24 },
      { label: 'Disc %',      x: ML + 132,  align: 'right', width: 18 },
      { label: 'Excl. total', x: ML + 154,  align: 'right', width: 28 },
    ];

    cols.forEach((c) => {
      doc.text(c.label, c.x + (c.align === 'right' ? c.width : 0), y + 5.2, { align: c.align });
    });

    y += 9;

    // Line items
    job.lineItems.forEach((item, i) => {
      if (y > 260) { doc.addPage(); y = PDFService.MT + 20; }

      if (i % 2 === 0) {
        doc.setFillColor(...LGRAY);
        doc.rect(ML, y, CW, 10, 'F');
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...DTEXT);
      doc.text(item.description, ML + 2, y + 4.5);

      if (item.scope) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(...MGRAY);
        doc.text(item.scope, ML + 2, y + 8.2);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...DTEXT);
      doc.text(String(item.qty), ML + 100, y + 4.5, { align: 'right' });
      doc.text(Job.formatCurrency(item.unitPrice), ML + 128, y + 4.5, { align: 'right' });
      doc.text(item.discount ? `${item.discount}%` : '-', ML + 150, y + 4.5, { align: 'right' });
      doc.text(Job.formatCurrency(item.totalExcl), ML + CW - 2, y + 4.5, { align: 'right' });

      y += 11;
    });

    // Totals
    y += 4;
    const totalsX = ML + CW * 0.5;
    const totalsW = CW * 0.5;

    const addTotalRow = (label, value, bold = false) => {
      if (y > 270) { doc.addPage(); y = PDFService.MT + 20; }
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(bold ? 9 : 8);
      const color = bold ? NAVY : MGRAY;
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(label, totalsX + 2, y);
      doc.text(value, ML + CW - 2, y, { align: 'right' });
      y += 6;
    };

    const discounted = job.discount > 0;
    if (discounted) {
      addTotalRow('Subtotal (excl. VAT)', Job.formatCurrency(job.subtotal));
      addTotalRow(`Discount (${job.discount}%)`, `-${Job.formatCurrency(job.discountAmount)}`);
    }
    addTotalRow(
      discounted ? 'After discount (excl. VAT)' : 'Subtotal (excl. VAT)',
      Job.formatCurrency(job.afterDiscount),
    );
    addTotalRow(`VAT (${job.vatRate}%)`, Job.formatCurrency(job.vatAmount));

    // Grand total box
    y += 2;
    doc.setFillColor(...NAVY);
    doc.rect(totalsX, y - 4, totalsW, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text('Total due (incl. VAT)', totalsX + 4, y + 2.5);
    doc.text(Job.formatCurrency(job.grandTotal), ML + CW - 3, y + 2.5, { align: 'right' });
    y += 14;

    // Payment terms, validity, banking and standing notes (from profile)
    const footerLines = [
      `Payment terms: ${job.paymentTerms}`,
      PROFILE.quoteValidity ? `Quote valid: ${PROFILE.quoteValidity}` : '',
      (PROFILE.bankName || PROFILE.bankHolder)
        ? `Bank: ${PROFILE.bankName || '-'}  |  Account holder: ${PROFILE.bankHolder || '-'}` : '',
      (PROFILE.bankAccount || PROFILE.branchCode)
        ? `Account number: ${PROFILE.bankAccount || '-'}  |  Branch code: ${PROFILE.branchCode || '-'}` : '',
    ].filter(Boolean);

    // Standing note can wrap onto several lines.
    const noteLines = PROFILE.quoteNotes
      ? doc.splitTextToSize(PROFILE.quoteNotes, CW) : [];

    const blockH = footerLines.length * 5 + (noteLines.length ? noteLines.length * 4 + 3 : 0);
    if (y + blockH > 285) {
      doc.addPage();
      y = PDFService.MT;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MGRAY);
    footerLines.forEach((line, i) => doc.text(line, ML, y + i * 5));

    if (noteLines.length) {
      let noteY = y + footerLines.length * 5 + 3;
      doc.setFont('helvetica', 'italic');
      noteLines.forEach((line, i) => doc.text(line, ML, noteY + i * 4));
    }
  }

  /** Add page numbers to all pages. */
  static _addPageNumbers(doc) {
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${i} of ${total}  -  ${PDFService.PROFILE.companyName}  -  Generated ${new Date().toLocaleDateString('en-ZA')}`,
        PDFService.PW / 2,
        PDFService.PH - 6,
        { align: 'center' },
      );
    }
  }

  static _startNewPage(doc) {
    doc.addPage();
  }
}

window.PDFService = PDFService;