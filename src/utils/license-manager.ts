/**
 * @file src/utils/license-manager.ts
 * @description
 * Universal utility to check trial and license status for marketplace extensions.
 *
 * ### Hardening (audit 2026-07):
 * - Cache key includes license keys: changing keys instantly invalidates stale "expired" cache
 * - Promise coalescing: concurrent calls share one in-flight request (thundering herd prevention)
 * - O(n) oldest-user scan replaces O(n²) sort (memory/CPU safe for 50k+ users)
 * - Install date cached at module scope: DB query runs once per server lifetime
 *
 * Resilience:
 * - Extension not on marketplace → works (treated as licensed)
 * - Marketplace down + key → trust key, stay licensed
 * - Marketplace down + no key → works (fail-open)
 * - NEVER throws
 */

import { getDb } from "@src/databases/db";
import { getPrivateSettingSync } from "@src/services/core/settings-service";

export interface LicenseStatus {
  active: boolean;
  daysRemaining: number | null;
  hasLicense: boolean;
}

const MARKETPLACE_VERIFY_URL = "https://marketplace.sveltycms.com/api/v1/license/verify";
const FETCH_TIMEOUT_MS = 5000;
const CACHE_PERMANENT_MS = 24 * 60 * 60 * 1000; // 24 hours

const licenseCache = new Map<string, { status: LicenseStatus; expiresAt: number }>();
const inFlightRequests = new Map<string, Promise<LicenseStatus>>();

let cachedInstallDate: Date | null = null;

function getCached(cacheKey: string): LicenseStatus | null {
  const entry = licenseCache.get(cacheKey);
  if (entry && entry.expiresAt > Date.now()) return entry.status;
  licenseCache.delete(cacheKey);
  return null;
}

function setCache(cacheKey: string, status: LicenseStatus): void {
  let ttl: number;

  if (
    status.active &&
    !status.hasLicense &&
    status.daysRemaining !== null &&
    status.daysRemaining > 0
  ) {
    ttl = Math.min(status.daysRemaining * 86400000 + 3600000, 14 * 86400000);
  } else {
    ttl = CACHE_PERMANENT_MS;
  }

  licenseCache.set(cacheKey, { status, expiresAt: Date.now() + ttl });
}

function safeGetSetting(key: string): string {
  try {
    const value = getPrivateSettingSync(key as any);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

async function fetchWithTimeout(url: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function verifyKeyWithMarketplace(
  licenseKey: string,
  extensionId: string,
): Promise<LicenseStatus | null> {
  try {
    const res = await fetchWithTimeout(MARKETPLACE_VERIFY_URL, {
      license_key: licenseKey,
      extension: extensionId,
    });

    if (res.status === 404) {
      return { active: true, daysRemaining: null, hasLicense: true };
    }

    if (res.ok) {
      try {
        const { valid } = await res.json();
        if (valid) {
          return { active: true, daysRemaining: null, hasLicense: true };
        }
      } catch {
        /* unparseable payload treated as invalid */
      }
      return null;
    }

    return null;
  } catch {
    return { active: true, daysRemaining: null, hasLicense: true };
  }
}

async function checkExtensionRegistration(extensionId: string): Promise<LicenseStatus | null> {
  try {
    const res = await fetchWithTimeout(MARKETPLACE_VERIFY_URL, {
      extension: extensionId,
    });

    if (res.status === 404) {
      return { active: true, daysRemaining: null, hasLicense: true };
    }

    return null;
  } catch {
    return { active: true, daysRemaining: null, hasLicense: true };
  }
}

async function computeTrialStatus(): Promise<LicenseStatus | null> {
  try {
    if (!cachedInstallDate) {
      const db = getDb();
      if (!db) return null;

      const users = await db.auth.getAllUsers();
      if (!Array.isArray(users) || users.length === 0) return null;

      // Single O(n) pass — no sort
      let oldestTime = Date.now();
      for (const u of users) {
        if (u.createdAt) {
          const t = new Date(u.createdAt).getTime();
          if (t < oldestTime) oldestTime = t;
        }
      }
      cachedInstallDate = new Date(oldestTime);
    }

    const now = Date.now();
    const trialEnd = cachedInstallDate.getTime() + 14 * 86400000;
    const daysRemaining = Math.ceil((trialEnd - now) / 86400000);

    if (daysRemaining > 0) {
      return { active: true, daysRemaining, hasLicense: false };
    }
    return { active: false, daysRemaining: 0, hasLicense: false };
  } catch {
    return null;
  }
}

export async function checkExtensionLicense(
  type: "widget" | "plugin" | "theme" | "dashboard",
  id: string,
): Promise<LicenseStatus> {
  const extensionId = `${type}:${id}`;

  const specificKeyName = `LICENSE_KEY_${type.toUpperCase()}_${id
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")}`;
  const specificKey = safeGetSetting(specificKeyName);
  const masterKey = safeGetSetting("LICENSE_KEY");

  // Dynamic cache key: changes when license keys change (auto-invalidates on purchase)
  const cacheKey = `${extensionId}|${specificKey}|${masterKey}`;

  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Promise coalescing: share single in-flight request across concurrent callers
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const licensePromise = (async (): Promise<LicenseStatus> => {
    try {
      if (specificKey) {
        const result = await verifyKeyWithMarketplace(specificKey, extensionId);
        if (result) return result;
      }

      if (masterKey) {
        const result = await verifyKeyWithMarketplace(masterKey, extensionId);
        if (result) return result;
      }

      const regCheck = await checkExtensionRegistration(extensionId);
      if (regCheck) return regCheck;

      const trial = await computeTrialStatus();
      if (trial) return trial;

      return { active: false, daysRemaining: 0, hasLicense: false };
    } catch {
      return { active: true, daysRemaining: null, hasLicense: true };
    }
  })();

  inFlightRequests.set(cacheKey, licensePromise);

  try {
    const finalResult = await licensePromise;
    setCache(cacheKey, finalResult);
    return finalResult;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}
