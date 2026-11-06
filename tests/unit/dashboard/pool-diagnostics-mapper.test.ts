/**
 * @file tests/unit/dashboard/pool-diagnostics-mapper.test.ts
 * @description Unit tests for the database pool widget payload mapper.
 *
 * The widget consumes `/api/database/pool-diagnostics`, which wraps its body in
 * the standard `{ success, data }` envelope. The mapper unwraps that envelope
 * and rejects malformed payloads so the widget keeps its loading state.
 */

import { describe, expect, it } from "vitest";
import { extractPoolDiagnostics } from "@src/routes/(app)/dashboard/widgets/database-pool-diagnostics/pool-diagnostics";

const diagnostics = {
  totalConnections: 20,
  activeConnections: 5,
  idleConnections: 15,
  waitingRequests: 0,
  poolUtilization: 25,
  avgConnectionTime: 1.4,
  healthStatus: "healthy",
  recommendations: ["Pool is healthy"],
};

describe("extractPoolDiagnostics", () => {
  it("unwraps the API success envelope", () => {
    expect(extractPoolDiagnostics({ success: true, data: diagnostics })).toEqual(diagnostics);
  });

  it("accepts an already-unwrapped payload", () => {
    expect(extractPoolDiagnostics(diagnostics)).toEqual(diagnostics);
  });

  it("returns null for failed, empty, and malformed payloads", () => {
    expect(extractPoolDiagnostics(null)).toBeNull();
    expect(extractPoolDiagnostics(undefined)).toBeNull();
    expect(extractPoolDiagnostics("nope")).toBeNull();
    expect(extractPoolDiagnostics({ success: false, error: "LICENSE_REQUIRED" })).toBeNull();
    expect(extractPoolDiagnostics({ success: true, data: null })).toBeNull();
    expect(
      extractPoolDiagnostics({ success: true, data: { ...diagnostics, totalConnections: "20" } }),
    ).toBeNull();
    expect(
      extractPoolDiagnostics({ success: true, data: { ...diagnostics, healthStatus: "warning" } }),
    ).toBeNull();
    expect(
      extractPoolDiagnostics({ success: true, data: { ...diagnostics, recommendations: "none" } }),
    ).toBeNull();
  });

  it("drops non-string recommendations instead of failing the payload", () => {
    const result = extractPoolDiagnostics({
      success: true,
      data: { ...diagnostics, recommendations: ["scale up", 42, null] },
    });

    expect(result?.recommendations).toEqual(["scale up"]);
  });
});
