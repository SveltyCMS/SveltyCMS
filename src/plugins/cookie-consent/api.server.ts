/**
 * @file src/plugins/cookie-consent/api.server.ts
 * @description Server-side consent logging API for the Cookie Consent Manager.
 *
 * Features:
 * - POST /api/plugins/cookie-consent/consent — logs consent to sys_consent_audit
 * - Validates origin against allowedOrigins config
 * - Records timestamp, consent choices, and tracking metadata
 */

import type { IDBAdapter } from "@src/databases/db-interface";
import { logger } from "@utils/logger";

interface ConsentPayload {
  categories: Record<string, boolean>;
  consentId: string;
  acceptedAt: string;
  userAgent?: string;
  origin?: string;
}

/**
 * Logs a consent decision to the sys_consent_audit collection.
 * Validates the origin against configured allowed origins for headless frontends.
 */
export async function handleConsentLog(
  db: IDBAdapter,
  payload: ConsentPayload,
  tenantId: string,
  allowedOrigins: string[] = [],
): Promise<{ success: boolean; message: string }> {
  try {
    // Validate origin if allowedOrigins is configured
    if (allowedOrigins.length > 0 && payload.origin) {
      const isAllowed = allowedOrigins.some((allowed) => {
        try {
          const allowedUrl = new URL(allowed);
          const requestUrl = new URL(payload.origin!);
          return allowedUrl.origin === requestUrl.origin;
        } catch {
          return allowed === payload.origin;
        }
      });

      if (!isAllowed) {
        logger.warn("[CookieConsent] Consent log rejected: origin not in allowedOrigins", {
          origin: payload.origin,
          allowedOrigins,
        });
        return { success: false, message: "Origin not allowed" };
      }
    }

    // Record the consent decision
    await db.crud.insertOne("sys_consent_audit", {
      consentId: payload.consentId,
      categories: payload.categories,
      acceptedAt: payload.acceptedAt,
      userAgent: payload.userAgent || "unknown",
      origin: payload.origin || "unknown",
      tenantId,
      createdAt: new Date().toISOString(),
    });

    logger.info("[CookieConsent] Consent decision logged", {
      consentId: payload.consentId,
      tenantId,
    });

    return { success: true, message: "Consent logged successfully" };
  } catch (err: any) {
    logger.error("[CookieConsent] Failed to log consent", { error: err, tenantId });
    return { success: false, message: err.message };
  }
}
