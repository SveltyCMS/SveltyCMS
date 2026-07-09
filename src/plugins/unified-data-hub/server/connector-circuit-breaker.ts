/**
 * @file src/plugins/unified-data-hub/server/connector-circuit-breaker.ts
 * @description Per-connector circuit breaker for federation egress (v1.5).
 *
 * Opens after consecutive failures; auto-resets after cooldown. Separate from
 * CMS database resilience — scoped to external connector I/O only.
 *
 * Features:
 * - 3-failure threshold per connectorId
 * - 60s cooldown before half-open retry
 * - Test-only reset helpers
 */

import { FederationError } from "../types";

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;

interface CircuitState {
  failures: number;
  openedAt: number | null;
}

const circuits = new Map<string, CircuitState>();

export function assertConnectorCircuitClosed(connectorId: string): void {
  const state = circuits.get(connectorId);
  if (!state?.openedAt) return;

  const elapsed = Date.now() - state.openedAt;
  if (elapsed >= COOLDOWN_MS) {
    // Half-open: allow probe request
    return;
  }

  throw new FederationError(
    "CONNECTOR_CIRCUIT_OPEN",
    `Connector '${connectorId}' circuit breaker is open — retry after ${Math.ceil((COOLDOWN_MS - elapsed) / 1000)}s`,
    503,
  );
}

export function recordConnectorSuccess(connectorId: string): void {
  circuits.delete(connectorId);
}

export function recordConnectorFailure(connectorId: string): void {
  const state = circuits.get(connectorId) ?? { failures: 0, openedAt: null };
  state.failures += 1;
  if (state.failures >= FAILURE_THRESHOLD && !state.openedAt) {
    state.openedAt = Date.now();
  }
  circuits.set(connectorId, state);
}

export function resetConnectorCircuit(connectorId: string): void {
  circuits.delete(connectorId);
}

export function clearAllConnectorCircuits(): void {
  circuits.clear();
}

export function getConnectorCircuitStats(): {
  tracked: number;
  open: number;
} {
  let open = 0;
  const now = Date.now();
  for (const state of circuits.values()) {
    if (state.openedAt && now - state.openedAt < COOLDOWN_MS) open += 1;
  }
  return { tracked: circuits.size, open };
}
