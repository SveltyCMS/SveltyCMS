/**
 * @file src/hooks/handle-security.ts
 * @description Unified security middleware consolidating firewall, rate limiting, and payload analysis.
 */

import { dev } from "$app/environment";
import { metricsService } from "@src/services/metrics-service";
import { securityResponseService } from "@src/services/security-response-service";
import { error, type Handle, type RequestEvent } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { getTenantIdFromHostname } from "@utils/tenant-utils";
import { getPrivateSettingSync } from "@src/services/settings-service";

/**
 * Consolidated security hook that performs:
 * 1. Rate Limiting
 * 2. Payload Analysis (SQLi, XSS, etc.)
 * 3. Bot Detection
 * 4. CSRF Protection
 */
export const handleSecurity: Handle = async ({ event, resolve }) => {
  const { request, url } = event;
  const clientIp = getClientIp(event);

  // Skip for static assets and dev mode/test mode localhost (unless forced)
  const isTestMode = process.env.TEST_MODE === "true" || process.env.VITE_TEST_MODE === "true";
  const isLocal =
    isLocalhost(clientIp) || url.hostname === "localhost" || url.hostname === "127.0.0.1";

  if (
    isStaticAsset(url.pathname) ||
    (isLocal && (dev || isTestMode) && request.headers.get("x-test-security") !== "true")
  ) {
    return await resolve(event);
  }

  let tenantId: string | undefined = undefined;
  try {
    if (getPrivateSettingSync("MULTI_TENANT") && !getPrivateSettingSync("DEMO")) {
      tenantId = getTenantIdFromHostname(url.hostname, true) || undefined;
    }
  } catch {
    // Ignore tenant miss
  }

  try {
    // 1. Analyze request for threats (Firewall + Payload Scan + Rate Limiting)
    const securityStatus = await securityResponseService.analyzeRequest(
      request,
      clientIp,
      tenantId,
    );

    if (securityStatus.action !== "allow") {
      metricsService.incrementSecurityViolations(tenantId);

      const statusCode = securityStatus.action === "block" ? 403 : 429;

      logger.warn(
        `Security action triggered: ${securityStatus.action} - ${securityStatus.reason}`,
        {
          ip: clientIp,
          url: url.pathname,
          level: securityStatus.level,
        },
      );

      if (url.pathname.startsWith("/api/")) {
        return handleApiError(
          new AppError(securityStatus.reason || "Security violation", statusCode),
          event,
        );
      }

      throw error(statusCode, securityStatus.reason || "Forbidden");
    }

    // 2. Request passed security checks
    return await resolve(event);
  } catch (err) {
    if (url.pathname.startsWith("/api/")) {
      return handleApiError(err, event);
    }
    if (err instanceof AppError) {
      throw error(err.status, err.message);
    }
    throw err;
  }
};

function getClientIp(event: RequestEvent): string {
  try {
    return event.getClientAddress();
  } catch {
    return (
      event.request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      event.request.headers.get("x-real-ip") ||
      "127.0.0.1"
    );
  }
}

function isLocalhost(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

const STATIC_EXTENSIONS = /\.(js|css|map|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/;
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/static/") ||
    pathname.startsWith("/_app/") ||
    STATIC_EXTENSIONS.test(pathname)
  );
}
