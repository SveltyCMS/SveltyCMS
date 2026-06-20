/**
 * @file src/routes/api/theme/public/+server.ts
 * @description
 * Public theme branding endpoint — returns tenant branding without authentication.
 * Used by the login page to show tenant-specific logo, site name, and accent colors.
 *
 * Query params:
 *   ?hostname=tenant.example.com  — resolves tenant from hostname
 *   ?tenantId=my-tenant            — explicit tenant ID
 *
 * Returns: { siteName, logoUrl, accentColor } or { siteName: null, logoUrl: null, accentColor: null }
 *
 * ### Features:
 * - unauthenticated access (standalone route outside auth pipeline)
 * - graceful fallback to nulls on any error
 * - multi-tenant aware via hostname or explicit tenantId
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTenantIdFromHostname } from "@utils/tenant";
import { getPublicSetting, getUntypedSetting } from "@src/services/core/settings-service";
import { logger } from "@utils/logger";

export const GET: RequestHandler = async ({ url }) => {
  const hostname = url.searchParams.get("hostname");
  const explicitTenantId = url.searchParams.get("tenantId");

  let tenantId: string | null = null;
  try {
    if (explicitTenantId) {
      tenantId = explicitTenantId;
    } else if (hostname) {
      tenantId = getTenantIdFromHostname(hostname, true);
    }
  } catch {
    logger.warn("Failed to resolve tenant ID for public theme endpoint", {
      hostname,
      explicitTenantId,
    });
    return json({ siteName: null, logoUrl: null, accentColor: null });
  }

  if (!tenantId || tenantId === "default") {
    return json({ siteName: null, logoUrl: null, accentColor: null });
  }

  try {
    const [siteName, logoUrl, accentColor] = await Promise.all([
      getPublicSetting("SITE_NAME", tenantId).catch(() => null),
      getUntypedSetting<string>("LOGO_URL", "public", tenantId).catch(() => null),
      getUntypedSetting<string>("ACCENT_COLOR", "public", tenantId).catch(() => null),
    ]);

    return json({
      siteName: siteName || null,
      logoUrl: logoUrl || null,
      accentColor: accentColor || null,
    });
  } catch (err) {
    logger.warn("Failed to load theme settings for public endpoint", {
      tenantId,
      error: String(err),
    });
    return json({ siteName: null, logoUrl: null, accentColor: null });
  }
};
