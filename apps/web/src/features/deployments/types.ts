/** Deployment domain types (Phase 3). */

export const DEPLOYMENT_TYPES = ["space", "inference_endpoint"] as const;
export type DeploymentType = (typeof DEPLOYMENT_TYPES)[number];

export const DEPLOYMENT_STATUSES = [
  "pending",
  "building",
  "running",
  "sleeping",
  "stopped",
  "failed",
] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const VISIBILITIES = ["public", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
