/**
 * @file src/plugins/pagespeed/url-utils.ts
 * @description URL derivation and validation utilities for PageSpeed plugin.
 * Handles localization and prevents SSRF attacks.
 */

import type { Schema } from "@content/types";
import { logger } from "@utils/logger.server";

/**
 * Derive the public URL for an entry using schema definitions and localization rules.
 */
export function deriveEntryUrl(
  baseUrl: string,
  language: string,
  baseLocale: string,
  entry: Record<string, unknown>,
  schema: Schema,
): string | null {
  try {
    // 1. Identify slug field from schema metadata or naming conventions
    const slugField = schema.fields.find(
      (f: any) =>
        f.widget === "slug" ||
        f.name === "slug" ||
        f.db_fieldName === "slug" ||
        f.db_fieldName === "path",
    );

    if (!slugField) {
      logger.warn("PageSpeed: No slug/path field found in schema", { collection: schema.name });
      return null;
    }

    const fieldName = (slugField as any).db_fieldName || (slugField as any).name;
    let slug = entry[fieldName];

    // 2. Handle localization (SveltyCMS translated field structure)
    if (slug && typeof slug === "object" && !Array.isArray(slug)) {
      slug =
        (slug as Record<string, unknown>)[language] ||
        (slug as Record<string, unknown>)[baseLocale];
    }

    if (!slug || typeof slug !== "string") {
      return null;
    }

    // 3. Construct absolute URL
    const cleanBase = baseUrl.replace(/\/$/, "");
    const cleanSlug = slug.startsWith("/") ? slug : `/${slug}`;

    // Root locale usually doesn't have a prefix (e.g. /about)
    // Other locales use prefix (e.g. /de/about)
    const prefix = language === baseLocale ? "" : `/${language}`;

    const finalUrl = `${cleanBase}${prefix}${cleanSlug}`;

    return finalUrl;
  } catch (error) {
    logger.error("PageSpeed: URL derivation failed", { error, entryId: entry._id });
    return null;
  }
}

/**
 * 🛡️ Security: Validate URL to prevent SSRF (Server-Side Request Forgery).
 * Ensures the target URL belongs to the allowed system domain.
 */
export function validateUrl(url: string, allowedBaseUrl: string): boolean {
  try {
    const target = new URL(url);
    const allowed = new URL(allowedBaseUrl);

    // Protocol check
    if (target.protocol !== "https:") {
      logger.warn("PageSpeed Security: Non-HTTPS URL rejected", { url });
      return false;
    }

    // Hostname check (Strict)
    if (target.hostname !== allowed.hostname) {
      logger.warn("PageSpeed Security: Cross-domain analysis rejected", {
        target: target.hostname,
        allowed: allowed.hostname,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("PageSpeed: URL validation exception", { error, url });
    return false;
  }
}
