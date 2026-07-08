/**
 * @file src/utils/license-manager.ts
 * @description
 * Universal utility to check trial and license status for marketplace extensions.
 *
 * Resilience:
 * - Extension not on marketplace → works (treated as licensed)
 * - Marketplace down + key → trust key, stay licensed
 * - Marketplace down + no key → works (fail-open)
 * - NEVER throws
 *
 * Caching:
 * - Licensed/expired/unregistered: cache until restart
 * - Trial: cache until trial end
 *
 * Resolution:
 * 1. Cache
 * 2. Specific key → marketplace verify
 * 3. Master key → marketplace verify
 * 4. Extension registration check → 404 = unregistered (works)
 * 5. 14-day trial → active or expired
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
const CACHE_PERMANENT_MS = 365 * 24 * 60 * 60 * 1000;

const licenseCache = new Map<string, { status: LicenseStatus; expiresAt: number }>();

function getCached(extensionId: string): LicenseStatus | null {
  const entry = licenseCache.get(extensionId);
  if (entry && entry.expiresAt > Date.now()) return entry.status;
  licenseCache.delete(extensionId);
  return null;
}

function setCache(extensionId: string, status: LicenseStatus): void {
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

  licenseCache.set(extensionId, { status, expiresAt: Date.now() + ttl });
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

/** Verify key. Marketplace down → trust the key, stay licensed. */
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
        /* unparseable */
      }
      return null;
    }

    return null;
  } catch {
    return { active: true, daysRemaining: null, hasLicense: true };
  }
}

/** Check if extension exists on marketplace. 404 or unreachable → treat as unregistered, works. */
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
    const db = getDb();
    if (!db) return null;

    const result = await db.auth.getAllUsers();
    if (!result || !Array.isArray(result) || result.length === 0) return null;

    const users = [...result].sort((a: any, b: any) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return da - db;
    });

    const firstUser = users[0];
    const installDate = firstUser.createdAt ? new Date(firstUser.createdAt) : new Date();
    const now = new Date();
    const trialEnd = new Date(installDate.getTime() + 14 * 86400000);
    const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000);

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

  const cached = getCached(extensionId);
  if (cached) return cached;

  try {
    const specificKeyName = `LICENSE_KEY_${type.toUpperCase()}_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    const specificKey = safeGetSetting(specificKeyName);
    if (specificKey) {
      const result = await verifyKeyWithMarketplace(specificKey, extensionId);
      if (result) {
        setCache(extensionId, result);
        return result;
      }
    }

    const masterKey = safeGetSetting("LICENSE_KEY");
    if (masterKey) {
      const result = await verifyKeyWithMarketplace(masterKey, extensionId);
      if (result) {
        setCache(extensionId, result);
        return result;
      }
    }

    const regCheck = await checkExtensionRegistration(extensionId);
    if (regCheck) {
      setCache(extensionId, regCheck);
      return regCheck;
    }

    const trial = await computeTrialStatus();
    if (trial) {
      setCache(extensionId, trial);
      return trial;
    }

    const expired: LicenseStatus = { active: false, daysRemaining: 0, hasLicense: false };
    setCache(extensionId, expired);
    return expired;
  } catch {
    const fallback: LicenseStatus = { active: true, daysRemaining: null, hasLicense: true };
    setCache(extensionId, fallback);
    return fallback;
  }
}
