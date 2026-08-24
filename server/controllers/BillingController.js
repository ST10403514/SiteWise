'use strict';

const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { SOLO_PRICE_CENTS, TEAM_PRICE_CENTS } = require('../utils/pricing');

const TIER_PRICES = { solo: SOLO_PRICE_CENTS, team: TEAM_PRICE_CENTS };

/**
 * Self-serve upgrades via Paystack: starting a checkout, receiving the
 * resulting webhook events, and cancelling. Knows nothing about HTML/UI -
 * public/js/pages/billing.js owns presenting this to the user.
 */
class BillingController {
  constructor({ businessRepository, paystackService, config }) {
    this._businesses = businessRepository;
    this._paystack = paystackService;
    this._config = config;
  }

  _requirePaystackConfigured() {
    if (!this._paystack.configured) {
      throw new ApiError(503, 'Billing is not set up yet - check back shortly.');
    }
  }

  checkout = async (req, res, next) => {
    try {
      this._requirePaystackConfigured();
      const tier = req.body?.tier;
      if (tier !== 'solo' && tier !== 'team') throw ApiError.badRequest('Choose a valid plan');

      const planCode = tier === 'solo' ? this._config.paystack.planSolo : this._config.paystack.planTeam;
      if (!planCode) throw new ApiError(503, 'Billing is not fully set up yet - check back shortly.');

      const { authorizationUrl } = await this._paystack.initializeTransaction({
        email: req.user.email,
        amountCents: TIER_PRICES[tier],
        planCode,
        metadata: { businessId: req.user.businessId, tier },
        callbackUrl: `${this._config.appBaseUrl}/billing`,
      });
      res.json({ authorizationUrl });
    } catch (err) { next(err); }
  };

  cancel = async (req, res, next) => {
    try {
      this._requirePaystackConfigured();
      const business = await this._businesses.findById(req.user.businessId);
      if (!business?.subscriptionCode) throw ApiError.badRequest('No active subscription to cancel');

      const subscription = await this._paystack.fetchSubscription(business.subscriptionCode);
      await this._paystack.disableSubscription({
        subscriptionCode: business.subscriptionCode,
        emailToken: subscription.email_token,
      });
      // Set locally too rather than waiting on the webhook round trip, so
      // the page reflects it immediately - the webhook will set the exact
      // same value moments later, a harmless no-op repeat.
      await this._businesses.setSubscriptionStatus(business.id, 'cancelled');
      res.json({ ok: true });
    } catch (err) { next(err); }
  };

  webhook = async (req, res, next) => {
    try {
      const signature = req.headers['x-paystack-signature'];
      if (!this._paystack.verifySignature(req.rawBody, signature)) {
        logger.warn({ path: req.originalUrl }, 'Paystack webhook: signature verification failed');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const event = req.body || {};
      // Logged at info level deliberately (not just on error) - the first
      // real event of each type needs to be eyeballed against what the
      // handlers below assume about payload shape (see the plan's "known
      // gap" note - this wasn't verified against a primary-source doc).
      logger.info({ event: event.event, data: event.data }, 'Paystack webhook received');

      switch (event.event) {
        case 'charge.success': await this._handleChargeSuccess(event.data); break;
        case 'subscription.create': await this._handleSubscriptionCreate(event.data); break;
        case 'subscription.disable':
        case 'subscription.not_renew': await this._setStatus(event.data, 'cancelled'); break;
        case 'invoice.payment_failed': await this._setStatus(event.data, 'past_due'); break;
        default: break; // unhandled event types are fine to ignore
      }
      res.sendStatus(200);
    } catch (err) { next(err); }
  };

  async _resolveBusiness(data) {
    const businessId = data?.metadata?.businessId;
    if (businessId) {
      const business = await this._businesses.findById(businessId);
      if (business) return business;
    }
    const customerCode = data?.customer?.customer_code;
    return customerCode ? this._businesses.findByPaystackCustomerCode(customerCode) : null;
  }

  async _handleChargeSuccess(data) {
    if (!data) return;
    const business = await this._resolveBusiness(data);
    if (!business) {
      logger.warn({ data }, 'Paystack charge.success: could not resolve a business for this event');
      return;
    }

    const tier = data.metadata?.tier;
    const customerCode = data.customer?.customer_code;
    if (tier === 'solo' || tier === 'team') {
      // The checkout-initiating charge (see #checkout above, which is the
      // only place this metadata gets set).
      await this._businesses.activateSubscription(business.id, {
        tier,
        paystackCustomerCode: customerCode || business.paystackCustomerCode,
      });
    } else if (business.subscriptionStatus === 'past_due') {
      // A retried renewal succeeded after an earlier attempt had failed -
      // clear the warning state. A normal on-time renewal never enters
      // past_due in the first place, so there's nothing to do for that.
      await this._businesses.setSubscriptionStatus(business.id, 'active');
    }

    // Renewal charges aren't guaranteed to carry the same metadata as the
    // initial checkout - asking Paystack directly for the subscription's
    // current next_payment_date keeps subscriptionRenewsAt accurate
    // regardless of what this specific charge event's payload looks like.
    if (business.subscriptionCode) {
      try {
        const sub = await this._paystack.fetchSubscription(business.subscriptionCode);
        if (sub?.next_payment_date) {
          await this._businesses.recordSubscription(business.id, {
            subscriptionCode: business.subscriptionCode,
            subscriptionRenewsAt: sub.next_payment_date,
          });
        }
      } catch (err) {
        logger.warn({ err, subscriptionCode: business.subscriptionCode }, 'Paystack charge.success: could not refresh the renewal date');
      }
    }
  }

  async _handleSubscriptionCreate(data) {
    if (!data) return;
    const business = await this._resolveBusiness(data);
    if (!business) {
      logger.warn({ data }, 'Paystack subscription.create: could not resolve a business for this event');
      return;
    }
    await this._businesses.recordSubscription(business.id, {
      subscriptionCode: data.subscription_code || null,
      subscriptionRenewsAt: data.next_payment_date || null,
    });
  }

  async _setStatus(data, status) {
    if (!data) return;
    const business = await this._resolveBusiness(data);
    if (!business) {
      logger.warn({ data, status }, 'Paystack webhook: could not resolve a business for this event');
      return;
    }
    await this._businesses.setSubscriptionStatus(business.id, status);
  }
}

module.exports = BillingController;
