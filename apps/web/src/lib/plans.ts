/*
  Plan pricing, in one place.

  The pricing table and the checkout API both read this. That matters for more
  than tidiness: the amount charged is resolved here from the plan key and the
  billing cycle, so a request that posts its own figure cannot decide what it
  pays. The client sends *which plan*, never *how much*.

  Prices are in Indian Rupees, per user. The annual figure is the discounted
  monthly rate when billed for a year.
*/

export type PlanKey = 'free' | 'team' | 'business';
export type Cadence = 'monthly' | 'annual';

export interface Plan {
  key: PlanKey;
  name: string;
  monthly: number;
  annual: number;
  seats: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

export const PLANS: Plan[] = [
  {
    key: 'free',
    name: 'Free',
    monthly: 0,
    annual: 0,
    seats: 'Up to 5 people',
    features: ['3 active projects', 'Kanban, wiki & real-time chat', 'Built-in time tracking', 'Community support'],
    cta: 'Start free',
  },
  {
    key: 'team',
    name: 'Team',
    monthly: 999,
    annual: 799,
    seats: 'Up to 25 people',
    features: [
      'Unlimited projects',
      'Sprints & burndown analytics',
      'Auto-Pilot self-updating board',
      'GitHub & Slack integrations',
      'Priority 24/7 support',
    ],
    cta: 'Choose Team',
    featured: true,
  },
  {
    key: 'business',
    name: 'Business',
    monthly: 2499,
    annual: 1999,
    seats: 'Unlimited team seats',
    features: [
      'Everything in Team',
      'Ask the Workspace (RBAC AI)',
      'Client portal access',
      'Audit log export',
      'SSO ready · 99.9% SLA',
    ],
    cta: 'Choose Business',
  },
];

export const planByKey = (key: string): Plan | undefined => PLANS.find((plan) => plan.key === key);

/** The authoritative amount for a plan on a billing cycle. */
export function priceFor(plan: Plan, cadence: Cadence): number {
  return cadence === 'annual' ? plan.annual : plan.monthly;
}

/** `₹1,999` — grouped the Indian way, which is what an INR checkout must do. */
export const rupees = (amount: number): string => `₹${amount.toLocaleString('en-IN')}`;
