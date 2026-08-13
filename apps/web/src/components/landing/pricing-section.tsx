'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RazorpayModal } from '@/components/razorpay-modal';
import { Icon } from '@/components/icons';
import { cx } from '@/lib/format';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { PLANS, planByKey, priceFor, rupees, type Cadence, type Plan } from '@/lib/plans';

/**
 * Pricing, and the front door to checkout.
 *
 * Paying is gated on having an account, which is how every subscription product
 * works and was the thing most obviously wrong here: anybody could open the
 * sheet and "buy" a plan that then belonged to nobody and appeared nowhere. A
 * purchase needs an owner, so the flow is now sign in (or sign up) first, and
 * the chosen plan rides along in the URL so the reader comes back to the
 * checkout they started rather than being dumped on a dashboard.
 */
export function PricingSection() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const toast = useToast();

  const [isAnnual, setIsAnnual] = useState(false);
  const [checkout, setCheckout] = useState<{ plan: Plan; cadence: Cadence } | null>(null);
  const cadence: Cadence = isAnnual ? 'annual' : 'monthly';

  const openCheckout = useCallback((plan: Plan, forCadence: Cadence) => {
    setCheckout({ plan, cadence: forCadence });
  }, []);

  /*
    Returning from sign-in with `?plan=` still set: pick the checkout back up
    where it was left. Read off `window.location` rather than useSearchParams so
    this section does not force a Suspense boundary onto the landing page.
  */
  useEffect(() => {
    if (!ready || !user) return;
    const params = new URLSearchParams(window.location.search);
    const key = params.get('plan');
    if (!key) return;

    const plan = planByKey(key);
    const resumed: Cadence = params.get('cadence') === 'annual' ? 'annual' : 'monthly';
    if (plan && plan.key !== 'free') {
      setIsAnnual(resumed === 'annual');
      openCheckout(plan, resumed);
    }

    // Clear the intent so a refresh does not reopen the sheet.
    params.delete('plan');
    params.delete('cadence');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}#pricing`);
  }, [ready, user, openCheckout]);

  const choosePlan = (plan: Plan) => {
    if (plan.key === 'free') {
      router.push(user ? '/app' : '/register');
      return;
    }

    // Not signed in: send them to sign in, carrying the plan so checkout resumes
    // here afterwards. The sign-in screen links on to registration for anyone
    // who does not have an account yet.
    if (!user) {
      const intent = `/?plan=${plan.key}&cadence=${cadence}#pricing`;
      router.push(`/login?next=${encodeURIComponent(intent)}`);
      return;
    }

    openCheckout(plan, cadence);
  };

  /* The sheet has settled. Record it, so the plan exists outside this modal. */
  const onSettled = async (details: { paymentId: string; amount: number; plan: string; method?: string }) => {
    if (!checkout) return;
    try {
      await api.post('/api/billing/subscription', {
        planKey: checkout.plan.key,
        cadence: checkout.cadence,
        paymentId: details.paymentId,
        method: details.method,
      });
      toast.success(`${checkout.plan.name} is now active on your account`);
      router.push('/profile?tab=billing');
    } catch (caught: unknown) {
      // The sheet already told them it settled, so failing silently here would
      // leave a plan they think they bought and cannot see.
      toast.error(`Payment recorded locally but the plan could not be saved: ${apiErrorMessage(caught)}`);
    } finally {
      setCheckout(null);
    }
  };

  return (
    <section id="pricing" className="scroll-mt-16 border-b">
      <div className="mx-auto max-w-6xl 2xl:max-w-7xl 3xl:max-w-[88rem] px-4 py-10 sm:px-6 sm:py-20">
        <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-end">
          <div className="max-w-2xl 2xl:max-w-3xl">
            <h2 data-reveal className="text-[22px] font-bold leading-tight sm:text-[26px] sm:leading-normal md:text-4xl 2xl:text-5xl">
              Simple, transparent pricing
            </h2>
            <p data-reveal className="mt-2 text-[14px] text-[var(--text-muted)] sm:text-[15px] 2xl:text-lg">
              All prices in Indian Rupees (INR). Upgrade when your team outgrows the free tier.
            </p>
          </div>

          {/* Billing cycle — the app's own segmented control, not a one-off pill. */}
          <div className="segmented w-full sm:w-auto">
            <button type="button" onClick={() => setIsAnnual(false)} className={cx('segmented-item', !isAnnual && 'segmented-item-active')}>
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setIsAnnual(true)}
              className={cx('segmented-item inline-flex items-center justify-center gap-1.5', isAnnual && 'segmented-item-active')}
            >
              Annual
              <span className="badge bg-[var(--success-soft)] text-[var(--success)]">Save 20%</span>
            </button>
          </div>
        </div>

        <div data-reveal-group className="mt-10 grid gap-4 lg:grid-cols-3 2xl:gap-6">
          {PLANS.map((plan) => {
            const price = priceFor(plan, cadence);
            return (
              <div
                key={plan.key}
                className={cx(
                  'flex flex-col p-5 sm:p-6 2xl:p-8',
                  plan.featured ? 'panel-ink relative shadow-[var(--shadow-lg)] lg:-translate-y-3' : 'card',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold 2xl:text-lg">{plan.name}</h3>
                  {plan.featured && (
                    <span className="badge shrink-0 bg-[color-mix(in_oklab,var(--ink-text)_14%,transparent)] text-[var(--ink-text)]">
                      <Icon.bolt width={11} height={11} /> Most popular
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-[34px] font-bold leading-none tracking-tight sm:text-4xl 2xl:text-5xl">{rupees(price)}</span>
                  <span className={cx('text-xs font-medium', plan.featured ? 'text-[var(--ink-muted)]' : 'text-[var(--text-muted)]')}>
                    {plan.key === 'free' ? 'forever' : 'per user / month'}
                  </span>
                </div>
                <p className={cx('mt-1.5 text-xs', plan.featured ? 'text-[var(--ink-faint)]' : 'text-[var(--text-faint)]')}>
                  {plan.seats}
                  {isAnnual && plan.key !== 'free' && ' · Billed annually'}
                </p>

                <ul className="mt-5 flex-1 space-y-2.5 border-t pt-5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className={cx(
                        'flex items-start gap-2.5 text-[13px] leading-relaxed 2xl:text-sm',
                        plan.featured ? 'text-[var(--ink-text)]' : 'text-[var(--text-muted)]',
                      )}
                    >
                      <Icon.check
                        width={14}
                        height={14}
                        className={cx('mt-[3px] shrink-0', plan.featured ? 'text-[var(--ink-muted)]' : 'text-[var(--success)]')}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => choosePlan(plan)}
                  className={cx('btn btn-hero mt-6', plan.featured ? 'btn-primary' : 'btn-secondary')}
                >
                  {plan.cta}
                </button>

                {/* Said once, on the plans that charge, so nobody reaches the
                    card form before learning an account is needed. */}
                {plan.key !== 'free' && !user && ready && (
                  <p className={cx('mt-2 text-center text-[11px]', plan.featured ? 'text-[var(--ink-faint)]' : 'text-[var(--text-faint)]')}>
                    Sign in to continue
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-1.5 text-center text-xs text-[var(--text-muted)] sm:flex-row sm:gap-3">
          <span className="flex items-center gap-1.5 font-semibold text-[var(--text)]">
            <Icon.shield width={14} height={14} />
            Secure Razorpay checkout
          </span>
          <span aria-hidden className="hidden sm:inline">·</span>
          <span>UPI, GPay, PhonePe, cards, netbanking &amp; EMI</span>
        </div>
      </div>

      {checkout && (
        <RazorpayModal
          isOpen
          onClose={() => setCheckout(null)}
          planName={`${checkout.plan.name} plan`}
          amountINR={priceFor(checkout.plan, checkout.cadence)}
          cadence={checkout.cadence === 'annual' ? 'billed annually' : 'billed monthly'}
          onSuccess={onSettled}
        />
      )}
    </section>
  );
}
