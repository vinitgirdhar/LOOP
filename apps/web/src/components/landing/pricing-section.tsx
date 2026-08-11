'use client';

import { useState } from 'react';
import { RazorpayModal } from '@/components/razorpay-modal';
import { Icon } from '@/components/icons';
import { cx } from '@/lib/format';

const PLANS = [
  {
    name: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    priceDisplay: '₹0',
    cadence: 'forever',
    seats: 'Up to 5 people',
    features: ['3 active projects', 'Kanban, wiki & real-time chat', 'Built-in time tracking', 'Community support'],
    cta: 'Start free',
    isFree: true,
  },
  {
    name: 'Team',
    monthlyPrice: 999,
    annualPrice: 799,
    priceDisplay: '₹999',
    annualPriceDisplay: '₹799',
    cadence: 'per user / month',
    seats: 'Up to 25 people',
    features: ['Unlimited projects', 'Sprints & burndown analytics', 'Auto-Pilot self-updating board', 'GitHub & Slack integrations', 'Priority 24/7 support'],
    cta: 'Start free trial',
    featured: true,
  },
  {
    name: 'Business',
    monthlyPrice: 2499,
    annualPrice: 1999,
    priceDisplay: '₹2,499',
    annualPriceDisplay: '₹1,999',
    cadence: 'per user / month',
    seats: 'Unlimited team seats',
    features: ['Everything in Team', 'Ask the Workspace (RBAC AI)', 'Client portal access', 'Audit log export', 'SSO ready · 99.9% SLA'],
    cta: 'Upgrade to Business',
  },
];

export function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [modalPlan, setModalPlan] = useState<{ name: string; amount: number } | null>(null);

  const handlePlanClick = (plan: typeof PLANS[0]) => {
    if (plan.isFree) {
      window.location.href = '/welcome';
      return;
    }
    const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
    setModalPlan({ name: plan.name, amount: price });
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
            <button type="button" onClick={() => setIsAnnual(true)} className={cx('segmented-item inline-flex items-center justify-center gap-1.5', isAnnual && 'segmented-item-active')}>
              Annual
              <span className="badge bg-[var(--success-soft)] text-[var(--success)]">Save 20%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div data-reveal-group className="mt-10 grid gap-4 lg:grid-cols-3 2xl:gap-6">
          {PLANS.map((plan) => {
            const currentPrice = isAnnual && plan.annualPriceDisplay ? plan.annualPriceDisplay : plan.priceDisplay;
            return (
              <div
                key={plan.name}
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
                  <span className="text-[34px] font-bold leading-none tracking-tight sm:text-4xl 2xl:text-5xl">{currentPrice}</span>
                  <span className={cx('text-xs font-medium', plan.featured ? 'text-[var(--ink-muted)]' : 'text-[var(--text-muted)]')}>
                    {plan.cadence}
                  </span>
                </div>
                <p className={cx('mt-1.5 text-xs', plan.featured ? 'text-[var(--ink-faint)]' : 'text-[var(--text-faint)]')}>
                  {plan.seats}
                  {isAnnual && !plan.isFree && ' · Billed annually'}
                </p>

                <ul className="mt-5 flex-1 space-y-2.5 border-t pt-5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className={cx('flex items-start gap-2.5 text-[13px] leading-relaxed 2xl:text-sm', plan.featured ? 'text-[var(--ink-text)]' : 'text-[var(--text-muted)]')}
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
                  onClick={() => handlePlanClick(plan)}
                  className={cx('btn btn-hero mt-6', plan.featured ? 'btn-primary' : 'btn-secondary')}
                >
                  {plan.cta}
                </button>
              </div>
            );
          })}
        </div>

        {/* Payment methods — wraps onto its own line rather than squeezing on a phone. */}
        <div className="mt-8 flex flex-col items-center justify-center gap-1.5 text-center text-xs text-[var(--text-muted)] sm:flex-row sm:gap-3">
          <span className="flex items-center gap-1.5 font-semibold text-[var(--text)]">
            <Icon.shield width={14} height={14} />
            Instant Razorpay checkout
          </span>
          <span aria-hidden className="hidden sm:inline">·</span>
          <span>UPI, GPay, PhonePe, cards, netbanking &amp; EMI</span>
        </div>

      </div>

      {/* Razorpay Interactive Checkout Modal */}
      {modalPlan && (
        <RazorpayModal
          isOpen={!!modalPlan}
          onClose={() => setModalPlan(null)}
          planName={`Loop ${modalPlan.name} Plan`}
          amountINR={modalPlan.amount}
          cadence={isAnnual ? 'annual billing' : 'monthly billing'}
          // The modal already shows its own confirmation state; there is nothing
          // for the page to do with the receipt on a marketing page.
          onSuccess={() => setModalPlan(null)}
        />
      )}
    </section>
  );
}
