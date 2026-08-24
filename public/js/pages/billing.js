'use strict';

const TIER_LABEL = { free: 'Free', solo: 'Solo', team: 'Team' };
const TIER_ORDER = { free: 0, solo: 1, team: 2 };
const CHECKOUT_TIER_KEY = 'sitewise_checkout_tier';

/** BillingPage - current plan, upgrade/cancel, and the return trip from
 * Paystack's hosted checkout. Server enforces owner-only for checkout/
 * cancel independently (requireOwner) - this page just avoids offering
 * buttons that would 403 anyway. */
class BillingPage {
  constructor() {
    this._api = new ApiClient();
    this._guard = new SessionGuard(this._api);
    this._$ = (id) => document.getElementById(id);
    this._toastTimer = null;
  }

  async init() {
    const user = await this._guard.requireOnboardedUser();
    if (!user) return;

    this._applyProfile(user.profile);
    AccountMenu.mount(user, this._guard);
    this._bindPlanButtons();

    const params = new URLSearchParams(location.search);
    const pendingTier = sessionStorage.getItem(CHECKOUT_TIER_KEY);
    const justReturned = params.has('reference') || params.has('trxref');

    if (pendingTier && justReturned) {
      sessionStorage.removeItem(CHECKOUT_TIER_KEY);
      await this._awaitUpgrade(pendingTier, user);
    } else {
      this._render(user);
    }
  }

  _applyProfile(profile) {
    Theme.apply(profile.scheme);
    this._$('companyName').textContent = profile.companyName;
    const logoBox = this._$('companyLogo');
    if (profile.logo) {
      logoBox.innerHTML = `<img src="${profile.logo}" alt="">`;
    } else {
      logoBox.textContent = (profile.companyName || 'S')[0].toUpperCase();
    }
  }

  _bindPlanButtons() {
    document.querySelectorAll('.plan-btn[data-action="checkout"]').forEach((btn) => {
      btn.addEventListener('click', () => this._startCheckout(btn.dataset.tier));
    });
  }

  async _startCheckout(tier) {
    try {
      const { authorizationUrl } = await this._api.startCheckout(tier);
      sessionStorage.setItem(CHECKOUT_TIER_KEY, tier);
      location.assign(authorizationUrl);
    } catch (err) {
      this._toast(err.message || 'Could not start checkout');
    }
  }

  /** Redirected back from Paystack - the webhook that actually activates the
   * new tier can land a moment after the browser does, so poll briefly
   * rather than assuming the redirect itself means success. */
  async _awaitUpgrade(pendingTier, initialUser) {
    this._$('confirmingBanner').hidden = false;
    let latest = initialUser;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && latest.tier !== pendingTier) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      latest = await this._guard.currentUser().catch(() => latest);
    }
    this._$('confirmingBanner').hidden = true;
    this._toast(latest.tier === pendingTier
      ? 'Upgrade complete!'
      : "Still confirming - refresh in a moment if this doesn't update.");
    this._render(latest);
    history.replaceState({}, '', '/billing'); // drop ?reference=... so a refresh doesn't re-trigger this
  }

  async _cancel() {
    if (!confirm("Cancel your subscription? You'll keep access until the end of the period you've already paid for.")) return;
    try {
      await this._api.cancelSubscription();
      this._toast('Subscription cancelled');
      const user = await this._guard.currentUser();
      this._render(user);
    } catch (err) {
      this._toast(err.message || 'Could not cancel');
    }
  }

  _render(user) {
    const box = this._$('currentPlan');
    box.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'cp-title';
    title.textContent = `Current plan: ${TIER_LABEL[user.tier] || 'Free'}`;
    box.append(title);

    if (user.tier !== 'free') {
      const detail = document.createElement('p');
      detail.className = 'cp-detail';
      if (user.subscriptionStatus === 'cancelled' && user.subscriptionRenewsAt) {
        detail.textContent = `Cancelled - you'll keep access until ${BillingPage._formatDate(user.subscriptionRenewsAt)}.`;
      } else if (user.subscriptionStatus === 'past_due') {
        detail.textContent = "Your last payment didn't go through - Paystack will retry automatically over the next few days.";
      } else if (user.subscriptionRenewsAt) {
        detail.textContent = `Renews ${BillingPage._formatDate(user.subscriptionRenewsAt)}.`;
      } else if (!user.subscriptionStatus) {
        detail.textContent = 'No billing on file for this plan.';
      }
      if (detail.textContent) box.append(detail);

      // Only a real, still-live Paystack subscription can actually be
      // cancelled - a tier set some other way (manual override, comped
      // account) has no subscriptionCode behind it, and subscriptionStatus
      // stays null for those, same as an account that's already cancelled.
      const cancellable = user.subscriptionStatus === 'active' || user.subscriptionStatus === 'past_due';
      if (cancellable && user.isOwner) {
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-light cancel-btn';
        cancelBtn.textContent = 'Cancel subscription';
        cancelBtn.addEventListener('click', () => this._cancel());
        box.append(cancelBtn);
      }
    }

    const currentOrder = TIER_ORDER[user.tier] ?? 0;
    document.querySelectorAll('.plan-card').forEach((card) => {
      const tier = card.dataset.tier;
      const btn = card.querySelector('.plan-btn');
      card.classList.toggle('is-current', tier === user.tier);
      if (tier === user.tier) {
        btn.textContent = 'Current plan';
        btn.disabled = true;
      } else if (TIER_ORDER[tier] < currentOrder) {
        btn.textContent = 'Included';
        btn.disabled = true;
      } else if (!user.isOwner) {
        btn.textContent = 'Owner only';
        btn.disabled = true;
      } else {
        btn.textContent = `Upgrade to ${TIER_LABEL[tier]}`;
        btn.disabled = false;
      }
    });
  }

  static _formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return iso;
    }
  }

  _toast(message) {
    const toast = this._$('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }
}

new BillingPage().init();
