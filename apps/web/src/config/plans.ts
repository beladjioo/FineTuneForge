/**
 * Commercial plans and their limits. Single source of truth used by the UI (pricing,
 * usage meters) and by the server (quota enforcement). Stripe wiring comes in Phase 4.
 */

export const PLAN_IDS = ["free", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

const MB = 1024 * 1024;

export interface PlanLimits {
  /** `null` means unlimited. */
  fineTunesPerMonth: number | null;
  privateDeployments: boolean;
  maxDatasets: number;
  maxDatasetBytes: number;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceMonthlyEur: number;
  tagline: string;
  limits: PlanLimits;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthlyEur: 0,
    tagline: "Pour découvrir le fine-tuning",
    limits: {
      fineTunesPerMonth: 1,
      privateDeployments: false,
      maxDatasets: 10,
      maxDatasetBytes: 10 * MB,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthlyEur: 29,
    tagline: "Fine-tunes illimités et déploiements privés",
    limits: {
      fineTunesPerMonth: null,
      privateDeployments: true,
      maxDatasets: 200,
      maxDatasetBytes: 50 * MB,
    },
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

/** Resolves a (possibly untrusted) plan value to its definition, defaulting to Free. */
export function getPlan(value: unknown): PlanDefinition {
  return PLANS[isPlanId(value) ? value : "free"];
}
