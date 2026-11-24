/**
 * @file src/hooks/policy.ts
 * @description Unified bitmask policy flags for request security and routing.
 *
 * Features:
 * - Zero-allocation integer bitmask flags for O(1) policy checks
 * - Covers auth mode, cookie stripping, CSRF, rate limiting, tenant scoping, and audit logging
 */

/** Bitmask flags governing how a route is authenticated, rate-limited, scoped, and audited. */
export const Policy = {
  NONE: 0,
  AUTH_COOKIE: 1 << 0,
  AUTH_TOKEN: 1 << 1,
  STRIP_COOKIES: 1 << 2,
  CSRF: 1 << 3,
  READ_LIMIT: 1 << 4,
  WRITE_LIMIT: 1 << 5,
  TENANT_SCOPE: 1 << 6,
  AUDIT_ASYNC: 1 << 7,
  AUDIT_SYNC: 1 << 8,
} as const;

export type PolicyMask = number;

/**
 * Checks whether all bits in `required` are set on `mask`.
 */
export function hasPolicy(mask: PolicyMask, required: PolicyMask): boolean {
  return (mask & required) === required;
}

/**
 * Checks whether any bit in `flags` is set on `mask`.
 */
export function hasAnyPolicy(mask: PolicyMask, flags: PolicyMask): boolean {
  return (mask & flags) !== 0;
}

/**
 * Formats a policy bitmask as a human-readable list of flag names for diagnostics.
 */
export function formatPolicy(mask: PolicyMask): string[] {
  const names: string[] = [];
  for (const [key, bit] of Object.entries(Policy)) {
    if (bit !== 0 && (mask & bit) === bit) {
      names.push(key);
    }
  }
  return names;
}
