/**
 * @file tests/unit/rate-limit/endpoint-cost.test.ts
 * @description Unit-Tests fuer das Endpoint-Cost-Modul (Cost-Aware Limiting).
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  getEndpointCost,
  listEndpointCosts,
  _setEndpointCostForTest,
  _resetEndpointCosts,
} from "@utils/rate-limit/endpoint-cost";

afterEach(() => {
  _resetEndpointCosts();
});

describe("getEndpointCost — Default-Fallback", () => {
  it("gibt 1 fuer unbekannte Endpunkte zurueck", () => {
    expect(getEndpointCost("/api/unknown")).toBe(1);
    expect(getEndpointCost("/")).toBe(1);
    expect(getEndpointCost("/api/users")).toBe(1);
  });
});

describe("getEndpointCost — Built-In-Kosten", () => {
  it("AI-Endpunkt kostet 10", () => {
    expect(getEndpointCost("/api/ai")).toBe(10);
    expect(getEndpointCost("/api/ai/copilot")).toBe(10);
    expect(getEndpointCost("/api/ai/builder")).toBe(10);
  });

  it("Media-Upload kostet 5", () => {
    expect(getEndpointCost("/api/media/upload")).toBe(5);
    expect(getEndpointCost("/api/media/upload/chunk")).toBe(5);
    expect(getEndpointCost("/api/media/stream")).toBe(5);
  });

  it("GraphQL kostet 2", () => {
    expect(getEndpointCost("/api/graphql")).toBe(2);
  });

  it("Migration kostet 8", () => {
    expect(getEndpointCost("/api/migration")).toBe(8);
    expect(getEndpointCost("/api/migration/import")).toBe(8);
  });

  it("Auth kostet 3", () => {
    expect(getEndpointCost("/api/auth")).toBe(3);
    expect(getEndpointCost("/api/auth/login")).toBe(3);
  });

  it("Preview kostet 2", () => {
    expect(getEndpointCost("/api/preview")).toBe(2);
    expect(getEndpointCost("/api/preview/authorize")).toBe(2);
  });
});

describe("getEndpointCost — Longest-Prefix-Match", () => {
  it("spezifischerer Prefix gewinnt gegen kuerzeren", () => {
    _setEndpointCostForTest("/api/ai", 10);
    _setEndpointCostForTest("/api/ai/copilot", 20);
    // /api/ai/copilot ist spezifischer → 20
    expect(getEndpointCost("/api/ai/copilot")).toBe(20);
    // /api/ai/other → nur /api/ai trifft → 10
    expect(getEndpointCost("/api/ai/other")).toBe(10);
  });

  it("Query-Parameter werden nicht als Teil des Pfades gezaehlt", () => {
    // /api/graphql?query=... sollte auf /api/graphql matchen
    expect(getEndpointCost("/api/graphql?query=hello")).toBe(2);
  });
});

describe("listEndpointCosts", () => {
  it("gibt nicht-leere Liste zurueck", () => {
    const costs = listEndpointCosts();
    expect(costs.length).toBeGreaterThan(0);
  });

  it("Liste ist nach Praefix-Laenge absteigend sortiert (Longest-Prefix zuerst)", () => {
    const costs = listEndpointCosts();
    for (let i = 0; i < costs.length - 1; i++) {
      expect(costs[i]![0].length).toBeGreaterThanOrEqual(costs[i + 1]![0].length);
    }
  });

  it("alle Kosten sind >= 1", () => {
    const costs = listEndpointCosts();
    for (const [, cost] of costs) {
      expect(cost).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("_setEndpointCostForTest — Laufzeit-Override", () => {
  it("ueberschreibt bestehende Kosten", () => {
    _setEndpointCostForTest("/api/graphql", 99);
    expect(getEndpointCost("/api/graphql")).toBe(99);
  });

  it("fuegt neue Eintraege hinzu", () => {
    _setEndpointCostForTest("/api/very/specific/path", 42);
    expect(getEndpointCost("/api/very/specific/path")).toBe(42);
    expect(getEndpointCost("/api/very/specific/path/sub")).toBe(42);
  });

  it("Reset stellt Built-In-Werte wieder her", () => {
    _setEndpointCostForTest("/api/graphql", 99);
    _resetEndpointCosts();
    expect(getEndpointCost("/api/graphql")).toBe(2); // Built-In
  });
});
