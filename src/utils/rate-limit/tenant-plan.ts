/**
 * @file src/utils/rate-limit/tenant-plan.ts
 * @description In-memory tenant rate-limit plan cache. Hot path is a Map get —
 * never a DB query. Writers (tenant-service, config load) call seedTenantPlan().
 */

export type TenantPlanName = "free" | "pro" | "enterprise" | string;

const TTL_MS = 60_000;
const MAX_ENTRIES = 4_096;

interface PlanEntry {
  scale: number;
  exp: number;
}

const plans = new Map<string, PlanEntry>();

function planToScale(plan: TenantPlanName | null | undefined): number {
  switch (plan) {
    case "enterprise":
      return 3;
    case "pro":
      return 1.5;
    case "free":
    default:
      return 1;
  }
}

export function seedTenantPlan(
  tenantId: string | null | undefined,
  plan: TenantPlanName | null | undefined,
): void {
  if (!tenantId || tenantId === "global") return;
  if (plans.size >= MAX_ENTRIES && !plans.has(tenantId)) {
    const oldest = plans.keys().next().value;
    if (oldest !== undefined) plans.delete(oldest);
  }
  plans.set(tenantId, { scale: planToScale(plan), exp: Date.now() + TTL_MS });
}

/** Hot-path scale. Miss / stale → 1.0 (never queries). */
export function getTenantPlanScale(tenantId: string | null | undefined): number {
  if (!tenantId || tenantId === "global") return 1;
  const hit = plans.get(tenantId);
  if (!hit || hit.exp <= Date.now()) return 1;
  return hit.scale;
}

export function _resetTenantPlans(): void {
  plans.clear();
}
