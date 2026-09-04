/**
 * @file src/utils/client-license-cache.ts
 * @description Client-side memory cache and request coalescing for extension license checks.
 *
 * Features:
 * - Single-flight request coalescing (prevents thundering herd on widget mount)
 * - In-memory TTL cache (60s) for zero-overhead re-renders
 * - Fail-open fallback on network errors
 */

import type { LicenseStatus } from "./license-manager";

const _clientLicenseCache = new Map<string, { status: LicenseStatus; expiresAt: number }>();
const _inFlight = new Map<string, Promise<LicenseStatus>>();

export async function getClientLicenseStatus(type: string, id: string): Promise<LicenseStatus> {
  const key = `${type}:${id}`;
  const cached = _clientLicenseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.status;
  }

  const inFlight = _inFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const res = await fetch(
        `/api/system/license-status?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`,
      );
      const data = (await res.json()) as LicenseStatus;
      _clientLicenseCache.set(key, { status: data, expiresAt: Date.now() + 60000 });
      return data;
    } catch {
      return { active: true, hasLicense: true, daysRemaining: null };
    } finally {
      _inFlight.delete(key);
    }
  })();

  _inFlight.set(key, promise);
  return promise;
}

/** Reset in-memory cache and in-flight map (primarily for unit tests and session resets). */
export function resetClientLicenseCache(): void {
  _clientLicenseCache.clear();
  _inFlight.clear();
}
