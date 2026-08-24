'use strict';

const crypto = require('crypto');

const API_BASE = 'https://api.paystack.co';

/**
 * Thin wrapper over Paystack's REST API. Knows nothing about HTTP status
 * codes or Express - BillingController translates failures into responses,
 * the same split this codebase already uses for EmailService/StorageService.
 */
class PaystackService {
  /** @param {{secretKey: string|null}} config */
  constructor({ secretKey } = {}) {
    this._secretKey = secretKey || null;
  }

  get configured() {
    return !!this._secretKey;
  }

  async _request(method, path, body) {
    if (!this._secretKey) throw new Error('Paystack is not configured (missing PAYSTACK_SECRET_KEY)');
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this._secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.status) {
      const err = new Error(json?.message || `Paystack request failed (${res.status})`);
      err.cause = json;
      throw err;
    }
    return json.data;
  }

  /**
   * Starts a hosted-checkout transaction for a subscription. `amountCents`
   * is the smallest unit of the currency - cents for ZAR (Paystack's own
   * param is generically named "kobo" in their Naira-first docs, but it's
   * just the minor unit of whatever currency is passed).
   * @param {{email: string, amountCents: number, planCode: string, metadata: object, callbackUrl: string}} input
   * @returns {Promise<{authorizationUrl: string, reference: string}>}
   */
  async initializeTransaction({ email, amountCents, planCode, metadata, callbackUrl }) {
    // No explicit currency here - the plan itself already carries its own
    // (ZAR, set when it was created via ensurePlan), so this would just be
    // redundant. (An earlier version of this comment claimed passing one
    // broke plan attachment - that was wrong, traced to checking the
    // result through Paystack's transaction *list* endpoint, which doesn't
    // reliably surface the plan field; /transaction/verify does, and shows
    // the plan attaches correctly either way. Left removed anyway since
    // it's genuinely unneeded, but that wasn't the real bug.)
    const data = await this._request('POST', '/transaction/initialize', {
      email,
      amount: amountCents,
      plan: planCode,
      metadata,
      callback_url: callbackUrl,
    });
    return { authorizationUrl: data.authorization_url, reference: data.reference };
  }

  /** @returns {Promise<object>} the subscription object, including email_token */
  async fetchSubscription(subscriptionCode) {
    return this._request('GET', `/subscription/${encodeURIComponent(subscriptionCode)}`);
  }

  /** Paystack requires both the code and its email_token (from fetchSubscription) to disable one. */
  async disableSubscription({ subscriptionCode, emailToken }) {
    return this._request('POST', '/subscription/disable', {
      code: subscriptionCode,
      token: emailToken,
    });
  }

  /**
   * Idempotent - creates a Plan only if one with this name doesn't already
   * exist. Used by scripts/setup-paystack-plans.js, not at request time.
   * @returns {Promise<string>} the plan_code, new or existing
   */
  async ensurePlan({ name, amountCents, interval = 'monthly' }) {
    const existing = await this._request('GET', '/plan');
    const found = (existing || []).find((p) => p.name === name);
    if (found) return found.plan_code;
    const created = await this._request('POST', '/plan', {
      name,
      amount: amountCents,
      interval,
      currency: 'ZAR',
    });
    return created.plan_code;
  }

  /**
   * Verifies a webhook payload actually came from Paystack. MUST be checked
   * against the raw request body (see server/app.js's express.json verify
   * callback) - re-serializing the parsed body risks a byte mismatch that
   * would make every real webhook fail verification.
   * @param {Buffer} rawBody
   * @param {string|undefined} signatureHeader
   */
  verifySignature(rawBody, signatureHeader) {
    if (!this._secretKey || !signatureHeader || !rawBody) return false;
    const expected = crypto.createHmac('sha512', this._secretKey).update(rawBody).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signatureHeader, 'utf8');
    // timingSafeEqual throws on a length mismatch rather than returning
    // false - a forged/truncated header must fail closed, not crash.
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}

module.exports = PaystackService;
