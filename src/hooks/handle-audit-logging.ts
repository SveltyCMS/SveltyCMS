/**
 * @file src/hooks/handle-audit-logging.ts
 * @description Enhanced mutation audit logging with duration tracking and structured metadata.
 *
 * Optimized for:
 * - Performance: Fast-path exits for non-API and non-mutation requests.
 * - Security: Captures User, Tenant, IP, and Status for compliance.
 * - Observability: Captures micro-latency of mutation operations.
 */

import { logger } from "@utils/logger.server";
import type { Handle } from "@sveltejs/kit";

export const handleAuditLogging: Handle = async ({ event, resolve }) => {
  // 1. FAST-PATH: Only audit API mutations
  if (!event.url.pathname.startsWith("/api/")) return resolve(event);

  const method = event.request.method;
  const isMutation = ["POST", "PUT", "DELETE", "PATCH"].includes(method);
  if (!isMutation) return resolve(event);

  // 2. MONITORING: Track duration of the mutation
  const start = performance.now();

  const response = await resolve(event);

  // 3. AUDIT: Record structured entry for successful mutations
  if (response.ok || response.status === 201) {
    const durationMs = (performance.now() - start).toFixed(1);

    const logEntry = {
      timestamp: new Date().toISOString(),
      method,
      path: event.url.pathname,
      status: response.status,
      userId: (event.locals.user as any)?._id ?? "anonymous",
      tenantId: event.locals.tenantId ?? "global",
      ip: event.getClientAddress(),
      durationMs,
    };

    // Structured log for Phase 1.5 ingestion (ELK, Datadog, or Internal DB)
    logger.info("[AUDIT]", logEntry);
  }

  return response;
};
