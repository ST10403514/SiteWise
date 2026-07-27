'use strict';

/**
 * OnboardingPage - collects the company profile that turns SiteWise
 * into this tenant's own branded job-card suite.
 */
class OnboardingPage {
  constructor() {
    this._api = new ApiClient();
    this._guard = new SessionGuard(this._api);
    this._logoDataUrl = '';
    this._scheme = 'slate';
    this._$ = (id) => document.getElementById(id);
  }

  async init() {
    const user = await this._guard.requireUser();
    if (!user) return;

    this._buildIndustrySelect();
    this._buildSwatches();

    if (user.profile) this._prefill(user.profile);
    if (!this._$('companyEmail').value) this._$('companyEmail').value = user.email;

    this._$('logoBox').addEventListener('click', () => this._$('logoInput').click());
    this._$('logoInput').addEventListener('change', (e) => this._pickLogo(e));
    this._$('onbForm').addEventListener('submit', (e) => this._submit(e));
  }

  _buildIndustrySelect() {
    const select = this._$('industry');
    Object.entries(IndustryPresets.industries).forEach(([key, entry]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = entry.label;
      select.appendChild(option);
    });
    select.value = 'general';
  }

  _buildSwatches() {
    const box = this._$('swatches');
    Object.entries(IndustryPresets.colorSchemes).forEach(([key, scheme]) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'swatch';
      swatch.setAttribute('role', 'radio');
      swatch.dataset.key = key;
      swatch.innerHTML =
        `<span class="dots"><i style="background:${scheme.primary}"></i>` +
        `<i style="background:${scheme.accent}"></i></span>${scheme.label}`;
      swatch.addEventListener('click', () => this._selectScheme(key));
      box.appendChild(swatch);
    });
    this._selectScheme(this._scheme);
  }

  _selectScheme(key) {
    this._scheme = key;
    this._$('swatches').querySelectorAll('.swatch').forEach((el) =>
      el.setAttribute('aria-checked', String(el.dataset.key === key)));
    Theme.apply(key); // live preview - the page itself retints
  }

  _prefill(p) {
    const map = {
      companyName: p.companyName, tagline: p.tagline, companyEmail: p.email,
      phone: p.phone, addressLine: p.addressLine, city: p.city,
      website: p.website, regNumber: p.regNumber, vatNumber: p.vatNumber,
      bankName: p.bankName, bankHolder: p.bankHolder, bankAccount: p.bankAccount,
      branchCode: p.branchCode, paymentTerms: p.paymentTerms,
      quoteValidity: p.quoteValidity, quoteNotes: p.quoteNotes,
    };
    Object.entries(map).forEach(([id, value]) => {
      if (value) this._$(id).value = value;
    });
    if (p.industry) this._$('industry').value = p.industry;
    if (p.scheme) this._selectScheme(p.scheme);
    if (p.logo) this._setLogoPreview(p.logo);
  }

  async _pickLogo(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      this._logoDataUrl = await ImageTools.compress(file, 400, 0.9);
      this._setLogoPreview(this._logoDataUrl);
    } catch (err) {
      this._showError(err.message);
    }
  }

  _setLogoPreview(dataUrl) {
    this._logoDataUrl = dataUrl;
    this._$('logoBox').innerHTML = `<img src="${dataUrl}" alt="Company logo preview">`;
  }

  _showError(message) {
    const box = this._$('formError');
    box.textContent = message;
    box.classList.toggle('show', Boolean(message));
    if (message) box.scrollIntoView({ block: 'center' });
  }

  async _submit(event) {
    event.preventDefault();
    this._showError('');
    this._$('submitBtn').disabled = true;
    try {
      await this._api.saveProfile({
        companyName: this._$('companyName').value,
        tagline: this._$('tagline').value,
        email: this._$('companyEmail').value,
        phone: this._$('phone').value,
        addressLine: this._$('addressLine').value,
        city: this._$('city').value,
        website: this._$('website').value,
        regNumber: this._$('regNumber').value,
        vatNumber: this._$('vatNumber').value,
        quoteValidity: this._$('quoteValidity').value,
        quoteNotes: this._$('quoteNotes').value,
        industry: this._$('industry').value,
        scheme: this._scheme,
        bankName: this._$('bankName').value,
        bankHolder: this._$('bankHolder').value,
        bankAccount: this._$('bankAccount').value,
        branchCode: this._$('branchCode').value,
        paymentTerms: this._$('paymentTerms').value,
        logo: this._logoDataUrl,
      });
      location.replace('/app');
    } catch (err) {
      this._showError(err.message);
      this._$('submitBtn').disabled = false;
    }
  }
}

new OnboardingPage().init();