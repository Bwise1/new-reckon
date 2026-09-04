import { useCallback, useState } from 'react';

/**
 * Billing/plan catalogue and per-workspace demo settings, ported from the
 * YemiKrist prototype. Prices are the user's real intended tiers (Daily ₦1k,
 * Student ₦2k, Professional ₦10k, Premium ₦20k, Organization ₦50k). Billing
 * is not wired to a payment provider yet — the storage/plan state persists to
 * localStorage per workspace so the UI is fully explorable, but no charge is
 * made. When Paystack lands, swap the persistence for real subscription reads.
 */

export type PlanTier = 'free' | 'student' | 'professional' | 'premium' | 'organization';

export type Plan = {
  tier: PlanTier;
  name: string;
  audience: string;
  /** Monthly price in NGN. `0` renders as "Free", `null` as "Custom". */
  monthly: number | null;
  storageLimitGb: number;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    tier: 'free',
    name: 'Free',
    audience: 'Trying Reckon Bill out',
    monthly: 0,
    storageLimitGb: 1,
    features: ['1 active project', 'Single editor', 'Watermarked PDF export'],
  },
  {
    tier: 'student',
    name: 'Student',
    audience: 'Verified students and academics',
    monthly: 2000,
    storageLimitGb: 5,
    features: ['5 active projects', 'Clean exports', 'Community templates'],
  },
  {
    tier: 'professional',
    name: 'Professional',
    audience: 'Independent quantity surveyors',
    monthly: 10000,
    storageLimitGb: 10,
    features: ['Unlimited projects', 'Excel and PDF export', 'Branded BOQ headers', 'Priority email support'],
  },
  {
    tier: 'premium',
    name: 'Premium',
    audience: 'Growing cost consulting practices',
    monthly: 20000,
    storageLimitGb: 50,
    features: ['Everything in Professional', 'Up to 10 seats', 'Revision history', 'Shared rate libraries'],
  },
  {
    tier: 'organization',
    name: 'Organization',
    audience: 'Firms and enterprises',
    monthly: 50000,
    storageLimitGb: 500,
    features: ['Everything in Premium', 'Unlimited seats', 'SSO and audit logs', 'Dedicated success manager'],
  },
];

/** Pay-as-you-go rate in NGN for the flexible daily plan. */
export const DAILY_PLAN_RATE = 1000;

/** Bolt-on storage pack: how much each purchase adds, and its monthly price (NGN). */
export const STORAGE_PACK_GB = 100;
export const STORAGE_PACK_MONTHLY = 2500;

export function planFor(tier: PlanTier): Plan {
  return PLANS.find((plan) => plan.tier === tier) ?? PLANS[0];
}

export type WorkspaceSettings = {
  planTier: PlanTier;
  billingCycle: 'monthly' | 'annual';
  dailyPlanActive: boolean;
  storageUsedGb: number;
  storageAddonGb: number;
};

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  planTier: 'professional',
  billingCycle: 'monthly',
  dailyPlanActive: false,
  storageUsedGb: 4.2,
  storageAddonGb: 0,
};

const STORE_KEY = 'reckon_billing_settings';
type Store = Record<string, Partial<WorkspaceSettings>>;

function readStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}

/**
 * Per-workspace billing settings persisted to localStorage and keyed by
 * workspace id, so switching workspaces swaps plan and storage figures.
 */
export function useWorkspaceSettings(workspaceId: string | null) {
  const key = workspaceId ?? '__none__';
  const [store, setStore] = useState<Store>(readStore);

  const settings: WorkspaceSettings = { ...DEFAULT_WORKSPACE_SETTINGS, ...store[key] };

  const update = useCallback(
    (patch: Partial<WorkspaceSettings>) => {
      setStore((prev) => {
        const next = { ...prev, [key]: { ...prev[key], ...patch } };
        try {
          localStorage.setItem(STORE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [key],
  );

  return [settings, update] as const;
}
