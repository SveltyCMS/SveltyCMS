/**
 * @file src/utils/license-manager.ts
 * @description
 * Universal utility to check trial and license status for marketplace extensions.
 *
 * Responsibilities include:
 * - Computing 14-day trial period based on installation date.
 * - Checking the system for a master LICENSE_KEY or specific LICENSE_KEY_{TYPE}_{ID}.
 *
 * ### Features:
 * - 14-day trial calculation
 * - License key bypass for widgets, plugins, dashboards, and themes
 */

import { getDb } from "@src/databases/db";
import { getPrivateSettingSync } from "@src/services/core/settings-service";

export async function checkExtensionLicense(
  type: "widget" | "plugin" | "theme" | "dashboard",
  id: string,
) {
  // 1. Check for master license key
  const masterKey = getPrivateSettingSync("LICENSE_KEY");
  let licenseKeyToCheck = masterKey;

  // 2. Check for extension-specific license key (e.g. LICENSE_KEY_WIDGET_SEO)
  const specificKeyName = `LICENSE_KEY_${type.toUpperCase()}_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const specificKey = getPrivateSettingSync(specificKeyName as any);

  if (specificKey && typeof specificKey === "string" && specificKey.trim().length > 0) {
    licenseKeyToCheck = specificKey;
  }

  // 3. Verify key against marketplace API
  if (
    licenseKeyToCheck &&
    typeof licenseKeyToCheck === "string" &&
    licenseKeyToCheck.trim().length > 0
  ) {
    try {
      const res = await fetch("https://marketplace.sveltycms.com/api/v1/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: licenseKeyToCheck, extension: `${type}:${id}` }),
      });

      if (res.ok) {
        const { valid } = await res.json();
        if (valid) {
          return { active: true, daysRemaining: null, hasLicense: true };
        }
      } else {
        console.warn(`[${type}:${id}] Marketplace rejected license key.`);
      }
    } catch (err) {
      console.error(`[${type}:${id}] Error connecting to marketplace:`, err);
    }
  }

  // 4. Fallback to 14-day trial
  try {
    const db = getDb();
    if (!db) {
      return { active: false, daysRemaining: 0, hasLicense: false };
    }
    const result = await db.auth.getAllUsers();
    if (result && Array.isArray(result) && result.length > 0) {
      const users = [...result].sort((a: any, b: any) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return da - db;
      });

      const firstUser = users[0];
      const installDate = firstUser.createdAt ? new Date(firstUser.createdAt) : new Date();

      const now = new Date();
      const trialDays = 14;
      const trialEndDate = new Date(installDate.getTime() + trialDays * 24 * 60 * 60 * 1000);

      const diffMs = trialEndDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (daysRemaining > 0) {
        return { active: true, daysRemaining, hasLicense: false };
      } else {
        return { active: false, daysRemaining: 0, hasLicense: false };
      }
    }
  } catch (err) {
    console.error(`Failed to compute license status for [${type}:${id}]:`, err);
  }

  return { active: false, daysRemaining: 0, hasLicense: false };
}
