'use strict';

const crypto = require('crypto');
const { getClient } = require('./db');
const { currentMonthKey } = require('../utils/jobQuota');

/**
 * libSQL/Turso-backed business (tenant) store. A business holds the
 * branding/company profile that used to live directly on a user row -
 * multiple users (team members) can belong to one business.
 */
class BusinessRepository {
  constructor(config) {
    this._db = getClient(config);
  }

  _hydrate(row) {
    if (!row) return null;
    return {
      id: row.id,
      profile: row.profile ? JSON.parse(row.profile) : null,
      // 'free' | 'solo' | 'team'. Set by the Paystack webhook handler on a
      // real subscription event - callers that need to account for a
      // cancelled-but-still-paid-through subscription should read
      // jobQuota.js's effectiveTier(business) instead of this field
      // directly (see requireAuth for the standard example).
      tier: row.tier || 'free',
      jobsCreatedThisMonth: row.jobsCreatedThisMonth || 0,
      jobsCreatedMonthKey: row.jobsCreatedMonthKey || null,
      paystackCustomerCode: row.paystackCustomerCode || null,
      subscriptionCode: row.subscriptionCode || null,
      // null (never subscribed) | 'active' | 'cancelled' (won't renew, paid
      // through subscriptionRenewsAt) | 'past_due' (a renewal charge
      // failed, Paystack is retrying).
      subscriptionStatus: row.subscriptionStatus || null,
      subscriptionRenewsAt: row.subscriptionRenewsAt || null,
      // The subscription an upgrade most recently disabled, if any - see
      // markSuperseded() for why this needs its own field rather than just
      // comparing against subscriptionCode.
      supersededSubscriptionCode: row.supersededSubscriptionCode || null,
      createdAt: row.createdAt,
    };
  }

  /** @param {{profile?: object|null, tier?: string}} [input] */
  async create({ profile = null, tier = 'free' } = {}) {
    const business = {
      id: crypto.randomUUID(),
      profile,
      tier,
      createdAt: new Date().toISOString(),
    };
    await this._db.execute({
      sql: 'INSERT INTO businesses (id, profile, tier, createdAt) VALUES (:id, :profile, :tier, :createdAt)',
      args: {
        id: business.id,
        profile: profile ? JSON.stringify(profile) : null,
        tier,
        createdAt: business.createdAt,
      },
    });
    return business;
  }

  async findById(id) {
    const rs = await this._db.execute({
      sql: 'SELECT * FROM businesses WHERE id = ?',
      args: [id],
    });
    return this._hydrate(rs.rows[0]);
  }

  /** @param {{profile: object|null}} changes */
  async update(id, { profile }) {
    await this._db.execute({
      sql: 'UPDATE businesses SET profile = :profile WHERE id = :id',
      args: { id, profile: profile ? JSON.stringify(profile) : null },
    });
    return this.findById(id);
  }

  /** Manual override (support/comping an account) - the real, customer-facing
   * path is the Paystack webhook handler's activateSubscription() below. */
  async updateTier(id, tier) {
    await this._db.execute({ sql: 'UPDATE businesses SET tier = :tier WHERE id = :id', args: { id, tier } });
    return this.findById(id);
  }

  /** @returns {Promise<object|null>} */
  async findByPaystackCustomerCode(code) {
    const rs = await this._db.execute({
      sql: 'SELECT * FROM businesses WHERE paystackCustomerCode = ?',
      args: [code],
    });
    return this._hydrate(rs.rows[0]);
  }

  /**
   * charge.success for a subscription-linked transaction - the business
   * just paid for (or renewed) a paid tier. Idempotent: re-running with the
   * same values on a redelivered webhook is a harmless no-op.
   * @param {{tier: string, paystackCustomerCode: string}} changes
   */
  async activateSubscription(id, { tier, paystackCustomerCode }) {
    await this._db.execute({
      sql: `UPDATE businesses
            SET tier = :tier, paystackCustomerCode = :paystackCustomerCode, subscriptionStatus = 'active'
            WHERE id = :id`,
      args: { id, tier, paystackCustomerCode },
    });
  }

  /** subscription.create - Paystack has finished setting up the recurring
   * side once the first charge clears. @param {{subscriptionCode: string, subscriptionRenewsAt: string|null}} changes */
  async recordSubscription(id, { subscriptionCode, subscriptionRenewsAt }) {
    await this._db.execute({
      sql: 'UPDATE businesses SET subscriptionCode = :subscriptionCode, subscriptionRenewsAt = :subscriptionRenewsAt WHERE id = :id',
      args: { id, subscriptionCode, subscriptionRenewsAt },
    });
  }

  /** subscription.disable / subscription.not_renew / invoice.payment_failed -
   * a status change only. tier is deliberately untouched here - see
   * jobQuota.js's effectiveTier() for how/when access actually lapses.
   * @param {string} status */
  async setSubscriptionStatus(id, status) {
    await this._db.execute({
      sql: 'UPDATE businesses SET subscriptionStatus = :status WHERE id = :id',
      args: { id, status },
    });
  }

  /**
   * Records that `subscriptionCode` is being intentionally disabled as part
   * of an upgrade, BEFORE actually calling Paystack to disable it - so that
   * whenever the resulting subscription.disable webhook arrives (confirmed
   * for real: this can happen before subscription.create for the new
   * subscription has even been processed), it's recognized as expected
   * noise about a superseded subscription, not a cancellation of whatever
   * the business just upgraded to. Synchronous and set up front
   * deliberately - correctness here can't depend on webhook arrival order.
   */
  async markSuperseded(id, subscriptionCode) {
    await this._db.execute({
      sql: 'UPDATE businesses SET supersededSubscriptionCode = :subscriptionCode WHERE id = :id',
      args: { id, subscriptionCode },
    });
  }

  /**
   * Records one more job created this month, rolling the counter over to a
   * fresh month first if the stored one has passed. Called only on a
   * genuine new job create (JobController.save) - never on an update, and
   * never undone by a delete.
   *
   * A single atomic UPDATE rather than a read-then-write - the CASE does
   * the same rollover check jobQuota() does, in SQL, on the row being
   * written. This also closes a real (if rare) race: two concurrent
   * creates for the same business could previously both read the same
   * starting count and both write count+1, losing one of the increments.
   */
  async incrementMonthlyJobCount(id) {
    const key = currentMonthKey();
    await this._db.execute({
      sql: `UPDATE businesses
            SET jobsCreatedThisMonth = CASE WHEN jobsCreatedMonthKey = :key THEN jobsCreatedThisMonth + 1 ELSE 1 END,
                jobsCreatedMonthKey = :key
            WHERE id = :id`,
      args: { id, key },
    });
  }

  /** Only ever called once a business has no users/jobs left referencing it. */
  async delete(id) {
    await this._db.execute({ sql: 'DELETE FROM businesses WHERE id = ?', args: [id] });
  }
}

module.exports = BusinessRepository;
