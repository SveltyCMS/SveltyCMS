/**
 * @file src/routes/(app)/dashboard/widgets/database-pool-diagnostics/pool-diagnostics.ts
 * @description Pure mapper for the database pool diagnostics payload.
 *
 * The widget reads `/api/database/pool-diagnostics`, which answers with the
 * standard `{ success, data }` envelope. Dashboard widget endpoints return raw
 * bodies, so this module unwraps the envelope and validates the fields the
 * widget renders before they reach `ConnectionPoolDiagnostics`.
 *
 * ### Features:
 * - unwraps the API envelope and also accepts an already-unwrapped payload
 * - rejects malformed payloads (returns `null` so the widget keeps its loading state)
 * - dependency-free (no Svelte, no fetch) and unit-tested
 */

import type { ConnectionPoolDiagnostics } from "@src/databases/database-resilience";

type HealthStatus = ConnectionPoolDiagnostics["healthStatus"];

const HEALTH_STATUSES: readonly HealthStatus[] = ["healthy", "degraded", "critical"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isHealthStatus(value: unknown): value is HealthStatus {
  return typeof value === "string" && (HEALTH_STATUSES as readonly string[]).includes(value);
}

function toDiagnostics(value: unknown): ConnectionPoolDiagnostics | null {
  const record = asRecord(value);
  if (!record) return null;

  const totalConnections = toNumber(record.totalConnections);
  const activeConnections = toNumber(record.activeConnections);
  const idleConnections = toNumber(record.idleConnections);
  const waitingRequests = toNumber(record.waitingRequests);
  const poolUtilization = toNumber(record.poolUtilization);
  const avgConnectionTime = toNumber(record.avgConnectionTime);
  const recommendations = record.recommendations;

  if (
    totalConnections === null ||
    activeConnections === null ||
    idleConnections === null ||
    waitingRequests === null ||
    poolUtilization === null ||
    avgConnectionTime === null ||
    !isHealthStatus(record.healthStatus) ||
    !Array.isArray(recommendations)
  ) {
    return null;
  }

  return {
    totalConnections,
    activeConnections,
    idleConnections,
    waitingRequests,
    poolUtilization,
    avgConnectionTime,
    healthStatus: record.healthStatus,
    recommendations: recommendations.filter(
      (recommendation): recommendation is string => typeof recommendation === "string",
    ),
  };
}

/**
 * Extracts `ConnectionPoolDiagnostics` from a `/api/database/pool-diagnostics` body.
 */
export function extractPoolDiagnostics(payload: unknown): ConnectionPoolDiagnostics | null {
  const envelope = asRecord(payload);
  if (!envelope || envelope.success === false) return null;
  return toDiagnostics("data" in envelope ? envelope.data : payload);
}
