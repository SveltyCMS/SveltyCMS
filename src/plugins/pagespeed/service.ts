/**
 * @file src/plugins/pagespeed/service.ts
 * @description Google PageSpeed Insights API integration and data management.
 * Implements strict rate limiting, validation, and persistent caching.
 */

import type { IDBAdapter } from "@databases/db-interface";
import { getPrivateSettingSync } from "@src/services/settings-service";
import { logger } from "@utils/logger";
import type { GooglePageSpeedResponse, PageSpeedResult } from "./types";
import { validateUrl } from "./url-utils";

/**
 * Fetch PageSpeed Insights for a URL with strict validation and error handling.
 */
export async function fetchPageSpeedInsights(
  url: string,
  device: "mobile" | "desktop",
  allowedBaseUrl: string,
): Promise<Partial<PageSpeedResult> | null> {
  // 🛡️ Security: Validate URL to prevent SSRF and outside-of-scope testing
  if (!validateUrl(url, allowedBaseUrl)) {
    logger.warn("PageSpeed URL validation failed (out of scope or unsafe)", { url });
    return null;
  }

  // 🔑 Configuration: Get API key safely
  const apiKey = getPrivateSettingSync("GOOGLE_PAGESPEED_API_KEY");
  if (!apiKey) {
    logger.warn("GOOGLE_PAGESPEED_API_KEY not configured. Skipping PageSpeed fetch.");
    return null;
  }

  try {
    const apiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    apiUrl.searchParams.set("url", url);
    apiUrl.searchParams.set("strategy", device);
    apiUrl.searchParams.set("key", String(apiKey));
    apiUrl.searchParams.set("category", "performance");

    logger.debug("Calling Google PageSpeed API", { url, device });

    const response = await fetch(apiUrl.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      logger.error("PageSpeed API error response", {
        status: response.status,
        url,
        device,
        error: errorBody,
      });
      return null;
    }

    const data = (await response.json()) as GooglePageSpeedResponse;
    const { lighthouseResult } = data;

    if (!lighthouseResult?.categories?.performance) {
      logger.error("Malformed PageSpeed API response (no performance category)", { url });
      return null;
    }

    // Extraction with null-safety
    const audits = lighthouseResult.audits;
    const result: Partial<PageSpeedResult> = {
      performanceScore: Math.round((lighthouseResult.categories.performance.score || 0) * 100),
      fcp: audits["first-contentful-paint"]?.numericValue,
      lcp: audits["largest-contentful-paint"]?.numericValue,
      cls: audits["cumulative-layout-shift"]?.numericValue,
      tti: audits.interactive?.numericValue,
      tbt: audits["total-blocking-time"]?.numericValue,
      si: audits["speed-index"]?.numericValue,
      fetchedAt: new Date(),
      url,
    };

    logger.info("PageSpeed Insights fetched successfully", {
      url,
      device,
      score: result.performanceScore,
    });

    return result;
  } catch (error) {
    logger.error("Failed to fetch PageSpeed Insights (fetch exception)", { error, url });
    return null;
  }
}

/**
 * Get cached PageSpeed result from database.
 */
export async function getCachedResult(
  dbAdapter: IDBAdapter,
  entryId: string,
  collectionId: string,
  language: string,
  device: "mobile" | "desktop",
  tenantId: string,
  maxAgeMinutes = 1440, // 24 hours default
): Promise<PageSpeedResult | null> {
  try {
    const result = await dbAdapter.crud.findOne<PageSpeedResult>("pluginPagespeedResults", {
      entryId,
      collectionId,
      language,
      device,
      tenantId: (tenantId as any) || null,
    });

    if (!(result.success && result.data)) return null;

    // Staleness check
    const fetchedAt = new Date(result.data.fetchedAt).getTime();
    const ageMinutes = (Date.now() - fetchedAt) / (1000 * 60);

    if (ageMinutes > maxAgeMinutes) {
      logger.debug("PageSpeed cache is stale", { entryId, ageMinutes, maxAgeMinutes });
      return null;
    }

    return result.data;
  } catch (error) {
    logger.error("Failed to retrieve cached PageSpeed result", { error, entryId });
    return null;
  }
}

/**
 * Store PageSpeed result using Upsert pattern.
 */
export async function storeResult(
  dbAdapter: IDBAdapter,
  result: Omit<PageSpeedResult, "_id" | "createdAt" | "updatedAt">,
): Promise<boolean> {
  try {
    const filter = {
      entryId: result.entryId,
      collectionId: result.collectionId,
      language: result.language,
      device: result.device,
      tenantId: result.tenantId || null,
    };

    // Use upsert for atomic operation if supported by adapter, otherwise findOne + update/insert
    const existing = await dbAdapter.crud.findOne<PageSpeedResult>(
      "pluginPagespeedResults",
      filter,
    );

    if (existing.success && existing.data) {
      const update = await dbAdapter.crud.update("pluginPagespeedResults", existing.data._id, {
        ...(result as any),
      });
      return update.success;
    }

    const insert = await dbAdapter.crud.insert("pluginPagespeedResults", result as any);
    return insert.success;
  } catch (error) {
    logger.error("Failed to store PageSpeed result", { error });
    return false;
  }
}

/**
 * Batch-retrieve cached results for entry lists.
 */
export async function getMultipleCachedResults(
  dbAdapter: IDBAdapter,
  entryIds: string[],
  collectionId: string,
  language: string,
  device: "mobile" | "desktop",
  tenantId: string,
): Promise<Map<string, PageSpeedResult>> {
  const resultMap = new Map<string, PageSpeedResult>();

  try {
    const queryResult = await dbAdapter.crud.findMany<PageSpeedResult>(
      "pluginPagespeedResults",
      {
        entryId: { $in: entryIds },
        collectionId,
        language,
        device,
        tenantId: (tenantId as any) || null,
      },
      { limit: entryIds.length },
    );

    if (queryResult.success && queryResult.data) {
      for (const item of queryResult.data) {
        resultMap.set(item.entryId, item);
      }
    }
  } catch (error) {
    logger.error("Failed to batch-retrieve PageSpeed results", { error, entryIds });
  }

  return resultMap;
}
