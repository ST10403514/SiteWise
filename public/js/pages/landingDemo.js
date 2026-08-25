'use strict';

/**
 * Landing page live demo - lets a visitor download a real, fully-branded
 * quote PDF without signing up. Deliberately reuses PDFService/Job exactly
 * as the real app does (see PdfService.js's downloadQuote + Job.js's
 * forPdf()) rather than reimplementing any PDF drawing - the output must
 * be the same document a real customer would get, not a mockup of one.
 *
 * The "from" business is a fixed, fully-populated sample company (name,
 * tagline, contact block, banking, logo) rather than whatever sparse text
 * a visitor happens to type - a typed-only business name has no tagline,
 * contact line, address or logo to show, so the PDF looked thin no matter
 * what was typed. The visitor only supplies the job-specific details
 * (client, job, price), which is enough to make the output feel concrete
 * without needing to ask for a dozen more fields.
 *
 * Entirely client-side: nothing typed here is sent to the server or saved
 * anywhere, which is also what the on-page note next to the form says.
 */
(function () {
  const form = document.getElementById('demoForm');
  if (!form) return;

  const $ = (id) => document.getElementById(id);

  const DEMO_PROFILE = {
    companyName: 'Coastal Trade Co.',
    tagline: 'Reliable work, every time',
    email: 'hello@coastaltrade.co.za',
    phone: '021 555 0148',
    whatsapp: '082 555 0148',
    website: 'www.coastaltrade.co.za',
    addressLine: '14 Harbour Road',
    city: 'Cape Town',
    regNumber: '2019/123456/07',
    vatNumber: '4123456789',
    quoteValidity: '30 days',
    quoteNotes: 'Prices exclude VAT unless stated. A 50% deposit secures your booking date.',
    bankName: 'FNB',
    bankHolder: 'Coastal Trade Co',
    bankAccount: '62812345678',
    branchCode: '250655',
    scheme: 'slate',
  };

  const FALLBACK = {
    clientName: 'Sample Client',
    description: 'Site visit and repairs',
    price: 1500,
  };

  // A round monogram badge, drawn on a canvas and read back as a PNG data
  // URL - avoids embedding an image asset for a fake company that doesn't
  // have a real logo file, while still giving PDFService a real logo image
  // to place and scale exactly as it would a tenant's uploaded one.
  function buildMonogramLogo(companyName, primaryColor) {
    const initials = companyName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join('');

    const size = 240;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(size * 0.4)}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, size / 2, size / 2 + size * 0.03);

    return canvas.toDataURL('image/png');
  }

  function showError(message) {
    const box = $('demoError');
    box.textContent = message;
    box.classList.toggle('show', Boolean(message));
  }

  // Stamped onto the PDF itself (not just the page around it) so the
  // sample-company disclaimer travels with the file even if it's saved,
  // printed, or shared - drawn manually via PDFService's own page-geometry
  // constants and helpers rather than baking this into PdfService.js,
  // since real tenants' PDFs must never show it.
  function addDemoBanner(doc) {
    const { PW, PH, ML, MR } = PDFService;
    const bannerH = 16;
    const y = PH - 30;
    const total = doc.internal.getNumberOfPages();

    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFillColor(255, 247, 224);
      doc.setDrawColor(217, 119, 6);
      doc.setLineWidth(0.4);
      doc.roundedRect(ML, y, PW - ML - MR, bannerH, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(146, 64, 14);
      doc.text('This is a demo quote', PW / 2, y + 6, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(
        'Sign up and your own business details replace this sample company - not ours.',
        PW / 2, y + 11.5, { align: 'center' },
      );
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');

    const btn = $('demoBtn');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Generating…';

    try {
      const clientName = $('demoClientName').value.trim() || FALLBACK.clientName;
      const description = $('demoDescription').value.trim() || FALLBACK.description;
      const price = Number($('demoPrice').value) || FALLBACK.price;

      const scheme = IndustryPresets.scheme(DEMO_PROFILE.scheme);
      const logo = buildMonogramLogo(DEMO_PROFILE.companyName, scheme.primary);

      // Same calls the real app makes after onboarding/signup - just fed
      // with a fixed sample profile instead of a saved tenant one.
      PDFService.configure({ ...DEMO_PROFILE, logo });
      Job.setQuotePrefix(DEMO_PROFILE.companyName); // must run before `new Job()` - its constructor reads this

      // A single typed line item read as a bare, toy example next to a
      // real multi-item quote - two more realistic lines (scaled off
      // whatever price was entered, not fixed amounts) round it out into
      // something that reads like an actual job.
      const calloutFee = Math.max(250, Math.round((price * 0.08) / 10) * 10);
      const materials = Math.round((price * 0.22) / 10) * 10;

      const job = new Job();
      job.clientName = clientName;
      job.lineItems = [
        { description: 'Call-out & inspection', scope: 'Site visit & assessment', qty: 1, unitPrice: calloutFee, discount: 0 },
        { description, scope: 'Labour', qty: 1, unitPrice: price, discount: 0 },
        { description: 'Materials', scope: 'Supplied & delivered', qty: 1, unitPrice: materials, discount: 0 },
      ];

      // Replicates downloadQuote()'s own steps (see PdfService.js) instead
      // of calling it directly, so the demo banner can be stamped on before
      // the file is saved - downloadQuote() saves internally with no hook
      // to draw anything afterward.
      const jobData = job.forPdf();
      const doc = await PDFService._createDoc();
      const y = PDFService._addHeader(doc, jobData, 'QUOTATION');
      PDFService._addQuoteSection(doc, jobData, y);
      PDFService._addPageNumbers(doc);
      addDemoBanner(doc);
      doc.save(`${jobData.quoteNumber}-quote.pdf`);
    } catch (err) {
      showError(err.message || 'Could not generate the demo PDF - please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });
})();
