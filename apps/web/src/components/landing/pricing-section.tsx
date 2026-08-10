'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RazorpayModal } from '@/components/razorpay-modal';

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
    cta: 'Start free trial (Razorpay)',
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
      <div className="mx-auto max-w-6xl 2xl:max-w-7xl 3xl:max-w-[88rem] px-4 py-14 sm:px-6 sm:py-20">
        
        <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-end">
          <div className="max-w-2xl 2xl:max-w-3xl">
            <h2 data-reveal className="text-[26px] font-bold sm:text-4xl 2xl:text-5xl">
              Simple, transparent pricing
            </h2>
            <p data-reveal className="mt-2 text-[14px] text-[var(--text-muted)] sm:text-[15px] 2xl:text-lg">
              All prices in Indian Rupees (INR). Upgrade when your team outgrows the free tier.
            </p>
          </div>

          {/* Billing Cycle Toggle */}
          <div className="flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-sm text-xs font-semibold">
            <button
              type="button"
              onClick={() => setIsAnnual(false)}
              className={`rounded-full px-3.5 py-1.5 transition-all ${!isAnnual ? 'bg-[var(--text)] text-[var(--bg)] shadow' : 'text-[var(--text-muted)]'}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setIsAnnual(true)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-all ${isAnnual ? 'bg-[var(--text)] text-[var(--bg)] shadow' : 'text-[var(--text-muted)]'}`}
            >
              Annual
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                SAVE 20%
              </span>
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
                className={
                  plan.featured
                    ? 'panel-ink flex flex-col p-6 2xl:p-8 shadow-xl lg:-translate-y-3 relative border-2 border-[var(--text)]'
                    : 'card flex flex-col p-6 2xl:p-8'
                }
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg 2xl:text-xl font-bold">{plan.name}</h3>
                  {plan.featured && (
                    <span className="badge bg-emerald-500 text-white font-bold 2xl:text-xs">
                      ⚡ Popular in India
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-4xl 2xl:text-5xl font-extrabold tracking-tight">{currentPrice}</span>
                  <span className={plan.featured ? 'text-xs opacity-80 font-medium' : 'text-xs text-[var(--text-muted)] font-medium'}>
                    {plan.cadence}
                  </span>
                </div>
                <p className={plan.featured ? 'mt-1 text-xs opacity-75' : 'mt-1 text-xs text-[var(--text-faint)]'}>
                  {plan.seats} {isAnnual && !plan.isFree && '· Billed annually'}
                </p>

                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className={plan.featured ? 'flex items-start gap-2.5 text-[13px] 2xl:text-sm font-medium' : 'flex items-start gap-2.5 text-[13px] 2xl:text-sm text-[var(--text-muted)]'}>
                      <svg className="mt-0.5 shrink-0 text-emerald-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M4 12.5l5 5L20 6.5" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => handlePlanClick(plan)}
                  className={`btn btn-hero mt-8 w-full shadow-md font-bold text-sm ${plan.featured ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {plan.isFree ? plan.cta : `${plan.cta}`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Razorpay Trust Strip */}
        <div className="mt-8 flex items-center justify-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1 font-semibold">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Instant Razorpay Checkout
          </span>
          <span>•</span>
          <span>UPI, GPay, PhonePe, Cards, Netbanking & EMI</span>
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
          onSuccess={(details) => {
            console.log('Payment complete:', details);
          }}
        />
      )}
    </section>
  );
}
