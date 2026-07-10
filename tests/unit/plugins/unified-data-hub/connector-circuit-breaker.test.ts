/**
 * @file tests/unit/plugins/unified-data-hub/connector-circuit-breaker.test.ts
 * @description Per-connector federation circuit breaker behavior.
 */

import { afterEach, describe, expect, it } from "vitest";
import { FederationError } from "@plugins/unified-data-hub/types";
import {
  assertConnectorCircuitClosed,
  clearAllConnectorCircuits,
  getConnectorCircuitStats,
  recordConnectorFailure,
  recordConnectorSuccess,
  resetConnectorCircuit,
} from "@plugins/unified-data-hub/server/connector-circuit-breaker";

describe("connector circuit breaker", () => {
  afterEach(() => {
    clearAllConnectorCircuits();
  });

  it("allows requests when circuit is closed", () => {
    expect(() => assertConnectorCircuitClosed("conn-a")).not.toThrow();
  });

  it("opens after three consecutive failures", () => {
    recordConnectorFailure("conn-a");
    recordConnectorFailure("conn-a");
    expect(() => assertConnectorCircuitClosed("conn-a")).not.toThrow();
    recordConnectorFailure("conn-a");
    expect(() => assertConnectorCircuitClosed("conn-a")).toThrow(FederationError);
    try {
      assertConnectorCircuitClosed("conn-a");
    } catch (err) {
      expect((err as FederationError).code).toBe("CONNECTOR_CIRCUIT_OPEN");
    }
  });

  it("resets on success", () => {
    recordConnectorFailure("conn-a");
    recordConnectorFailure("conn-a");
    recordConnectorSuccess("conn-a");
    recordConnectorFailure("conn-a");
    expect(() => assertConnectorCircuitClosed("conn-a")).not.toThrow();
  });

  it("resetConnectorCircuit clears state", () => {
    recordConnectorFailure("conn-a");
    recordConnectorFailure("conn-a");
    recordConnectorFailure("conn-a");
    resetConnectorCircuit("conn-a");
    expect(getConnectorCircuitStats().tracked).toBe(0);
    expect(() => assertConnectorCircuitClosed("conn-a")).not.toThrow();
  });
});
