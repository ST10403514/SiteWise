'use strict';

// Combined, not per-type - a "project" is a job row with a project
// sub-object, not a separate entity, so there's only ever one count.
const FREE_TIER_MONTHLY_CAP = 5;

/** UTC 'YYYY-MM' - deliberately coarse (no day/hour), just enough to tell
 * "still this month" from "a new one has started". */
function currentMonthKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * A cancelled (or payment-failed) subscription keeps working until the
 * period it was already paid for actually ends - Paystack itself behaves
 * this way (disabling a subscription just stops the *next* charge, it
 * doesn't refund/revoke the current one). No cron needed to enforce the
 * eventual downgrade: like the month-key rollover above, it's just checked
 * lazily, here, against every read - once subscriptionRenewsAt is in the
 * past, the stored tier column is stale and this returns 'free' instead.
 * @param {{tier: string, subscriptionStatus?: string|null, subscriptionRenewsAt?: string|null}} business
 */
function effectiveTier(business) {
  const lapsed = (business.subscriptionStatus === 'cancelled' || business.subscriptionStatus === 'past_due')
    && business.subscriptionRenewsAt
    && Date.now() > Date.parse(business.subscriptionRenewsAt);
  return lapsed ? 'free' : business.tier;
}

/**
 * Where a business's free-tier monthly job-creation quota stands right now.
 * Pure - takes an already-fetched business row, makes no DB call itself, so
 * it's cheap enough to compute on every authenticated request (requireAuth)
 * as well as the one place that actually enforces it (JobController.save).
 *
 * Deletions never lower the stored count - that's the whole point (create,
 * download, delete can't be used to cycle past the cap). The count only
 * ever resets when the calendar month it was stored against has actually
 * passed, checked lazily here rather than by any background job.
 *
 * @param {{tier: string, jobsCreatedThisMonth?: number, jobsCreatedMonthKey?: string|null}} business
 */
function jobQuota(business) {
  const key = currentMonthKey();
  const count = business.jobsCreatedMonthKey === key ? (business.jobsCreatedThisMonth || 0) : 0;
  const unlimited = effectiveTier(business) !== 'free';
  return {
    count,
    cap: FREE_TIER_MONTHLY_CAP,
    remaining: unlimited ? null : Math.max(0, FREE_TIER_MONTHLY_CAP - count),
    unlimited,
    atCap: !unlimited && count >= FREE_TIER_MONTHLY_CAP,
  };
}

module.exports = { jobQuota, effectiveTier, currentMonthKey, FREE_TIER_MONTHLY_CAP };
