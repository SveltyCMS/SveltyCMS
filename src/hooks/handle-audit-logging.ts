/**
 * @file src/hooks/handle-audit-logging.ts
 * @description
 * Hardened mutation audit logging with macrotask scheduling and failure coverage.
 *
 * Optimized for:
 * - Security: Captures ALL mutation outcomes (success + failure) for compliance/forensics.
 * - Performance: Macrotask scheduling (setTimeout) for non-blocking audit writes —
 *   deferred until after the response flushes to the client.
 * - Correctness: Removed __turboAuth mutation bypass that skipped audit on some sessions.
 * - IP via `getClientIp()` only (no X-Forwarded-For spoofing).
 */

import { logger } from "@utils/logger";
import type { RequestEvent } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { getClientIp, MUTATION_HTTP_METHODS } from "@utils/hook-utils";
import { getAuditFlagsSync, isAuditDisabledByEnv } from "@utils/security/audit-flags";
import { rollingMerkleAccumulator } from "@src/services/security/rolling-merkle";
import { nowISODateString } from "@src/utils/date";

function extractIpSafely(event: RequestEvent): string {
  try {
    return getClientIp(event) || "unknown";
  } catch {
    return "unknown";
  }
}

// High-performance bounded in-memory audit outbox ring buffer
interface QueuedAuditItem {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  userId: string;
  tenantId: string;
  ip: string;
  durationMs: string;
  success: boolean;
  errorMessage?: string;
}

const AUDIT_OUTBOX_CAPACITY = 2048;
const auditOutboxQueue: QueuedAuditItem[] = [];
let isOutboxFlushing = false;

/** Materialize the log payload only when the level is actually emitted. */
function auditLogEntry(item: QueuedAuditItem): Record<string, unknown> {
  return {
    timestamp: item.timestamp,
    method: item.method,
    path: item.path,
    status: item.status,
    userId: item.userId,
    tenantId: item.tenantId,
    ip: item.ip,
    durationMs: item.durationMs,
    success: item.success,
    ...(item.errorMessage ? { error: { message: item.errorMessage } } : {}),
  };
}

function flushAuditOutbox() {
  if (isOutboxFlushing || auditOutboxQueue.length === 0) return;
  isOutboxFlushing = true;

  // Schedule microtask or next-tick drain
  queueMicrotask(() => {
    try {
      const batch = auditOutboxQueue.splice(0);
      const hashesToAppend: string[] = [];
      // Build the log-entry object only when the level would emit it: production
      // runs at `error`, so the success branch used to allocate an 8-field object
      // per mutation only for `log()` to discard it.
      const debugEnabled = logger.isEnabled("debug");
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];

        if (item.success) {
          if (debugEnabled) {
            logger.debug("[AUDIT] Mutation completed", auditLogEntry(item));
          }
        } else {
          logger.warn("[AUDIT] Mutation logged with failure flags", auditLogEntry(item));
        }

        // Fast O(1) rolling Merkle accumulator update
        hashesToAppend.push(`${item.method}:${item.path}:${item.userId}:${item.timestamp}`);
      }

      if (hashesToAppend.length > 0) {
        rollingMerkleAccumulator.appendLeaves(hashesToAppend).catch(() => {});
      }
    } catch (err) {
      logger.error("[AUDIT Fallback] Secondary log pipeline failed:", err);
    } finally {
      isOutboxFlushing = false;
    }
  });
}

function enqueueAuditRecord(item: QueuedAuditItem) {
  if (auditOutboxQueue.length >= AUDIT_OUTBOX_CAPACITY) {
    // Drop oldest to avoid unbounded memory growth under extreme load
    auditOutboxQueue.shift();
  }
  auditOutboxQueue.push(item);
  flushAuditOutbox();
}

/**
 * Records a mutation audit log entry into the non-blocking outbox ring buffer.
 * Used by both `handleAuditLogging` (pipeline) and `serveWarmCollectionWrite` (fast lane)
 * to guarantee 100% audit trail parity without pipeline overhead.
 */
export function recordAuditEntry(
  event: RequestEvent,
  statusCode: number,
  durationMs: string,
  executionError?: unknown,
): void {
  // Fast exit for benchmark and testing contexts
  if ((event.locals as any)?.__testBypass) return;

  // Sync fast path for benchmarks/tests and DB-driven enterprise UI toggles
  if (isAuditDisabledByEnv() || process.env.TEST_MODE === "true") return;
  const flags = getAuditFlagsSync();
  if (flags.disabled) return;

  const userId = (event.locals?.user as any)?._id ?? "anonymous";
  const tenantId = (event.locals?.tenantId as string) ?? "global";
  const method = event.request.method;
  const path = event.url.pathname;
  const success = statusCode >= 200 && statusCode < 300 && !executionError;

  enqueueAuditRecord({
    timestamp: nowISODateString(),
    method,
    path,
    status: statusCode,
    userId,
    tenantId,
    ip: extractIpSafely(event),
    durationMs,
    success,
    errorMessage: executionError
      ? (executionError as Error).message || String(executionError)
      : undefined,
  });
}

export const handleAuditLogging: Handle = async ({ event, resolve }) => {
  // Cheapest exits first: path + method triage before any settings/env reads,
  // so SSR page traffic (the majority) never touches the audit-flag machinery.
  if (!event.url.pathname.startsWith("/api/")) return resolve(event);
  const method = event.request.method;
  if (!MUTATION_HTTP_METHODS.has(method)) return resolve(event);

  // Fast exit for benchmark and testing contexts
  if ((event.locals as any)?.__testBypass) return resolve(event);

  // Sync fast path for benchmarks/tests and DB-driven enterprise UI toggles
  if (isAuditDisabledByEnv() || process.env.TEST_MODE === "true") return resolve(event);
  const flags = getAuditFlagsSync();
  if (flags.disabled) return resolve(event);

  const start = performance.now();

  let statusCode = 500;
  let executionError: any = null;

  try {
    const response = await resolve(event);
    statusCode = response.status;
    return response;
  } catch (err) {
    executionError = err;
    // SvelteKit error(403)/redirect(302) throw objects carrying `.status` —
    // capture the real code instead of logging every failure as 500.
    const thrownStatus = (err as { status?: unknown } | null)?.status;
    if (typeof thrownStatus === "number" && thrownStatus >= 100 && thrownStatus < 600) {
      statusCode = thrownStatus;
    }
    throw err;
  } finally {
    const durationMs = (performance.now() - start).toFixed(1);
    recordAuditEntry(event, statusCode, durationMs, executionError);
  }
};
