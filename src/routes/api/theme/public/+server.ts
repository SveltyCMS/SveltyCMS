/**
 * @file src/routes/api/theme/public/+server.ts
 * @description
 * Public theme branding endpoint — returns tenant branding without authentication.
 * Cached at 10-min TTL to eliminate repeated DB lookups during login storms.
 *
 * Query params:
 *   ?hostname=tenant.example.com  — resolves tenant from hostname
 *   ?tenantId=my-tenant            — explicit tenant ID
 *
 * Returns: { siteName, logoUrl, accentColor } or { siteName: null, logoUrl: null, accentColor: null }
 *
 * ### Features:
 * - unauthenticated access (standalone route outside auth pipeline)
 * - L1/R2 cache layer — <1ms response on cache hits
 * - graceful fallback to nulls on any error
 * - multi-tenant aware via hostname or explicit tenantId
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTenantIdFromHostname } from "@utils/tenant";
import { getPublicSetting, getUntypedSetting } from "@src/services/core/settings-service";
import { cacheService } from "@src/databases/cache/cache-service";
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

  const cacheKey = `theme:public:${tenantId}`;

  try {
    // Fast-path: L1/R2 cache hit (<1ms)
    const cachedBranding = await cacheService.get(cacheKey, tenantId);
    if (cachedBranding) {
      return json(typeof cachedBranding === "string" ? JSON.parse(cachedBranding) : cachedBranding);
    }

    // Slow-path: concurrent settings fetch (first request or cache expired)
    const [siteName, logoUrl, accentColor] = await Promise.all([
      getPublicSetting("SITE_NAME", tenantId).catch(() => null),
      getUntypedSetting<string>("LOGO_URL", "public", tenantId).catch(() => null),
      getUntypedSetting<string>("ACCENT_COLOR", "public", tenantId).catch(() => null),
    ]);

    const brandingPayload = {
      siteName: siteName || null,
      logoUrl: logoUrl || null,
      accentColor: accentColor || null,
    };

    // Fire-and-forget cache write (10-min TTL) to protect DB pool during login storms
    cacheService.set(cacheKey, brandingPayload, 600, tenantId).catch(() => {});

    return json(brandingPayload);
  } catch (err) {
    logger.warn("Failed to load theme settings for public endpoint", {
      tenantId,
      error: String(err),
    });
    return json({ siteName: null, logoUrl: null, accentColor: null });
  }
};
