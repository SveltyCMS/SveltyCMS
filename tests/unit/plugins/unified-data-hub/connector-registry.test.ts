/**
 * @file tests/unit/plugins/unified-data-hub/connector-registry.test.ts
 * @description Connector registry factory tests for all federation connector types.
 */

import { describe, expect, it } from "vitest";
import { FederationError } from "@plugins/unified-data-hub/types";
import { getConnectorInstance } from "@plugins/unified-data-hub/server/connector-registry";

describe("connector registry", () => {
  it("resolves all supported connector types", () => {
    for (const type of ["postgres", "mariadb", "sqlite", "mongodb", "rest"] as const) {
      const instance = getConnectorInstance(type);
      expect(instance.type).toBe(type);
      expect(instance.getDefaultCapabilities().maxPageSize).toBeGreaterThan(0);
    }
  });

  it("sql connectors are writable by default; REST is opt-in", () => {
    expect(getConnectorInstance("postgres").getDefaultCapabilities().writable).toBe(true);
    expect(getConnectorInstance("mariadb").getDefaultCapabilities().writable).toBe(true);
    expect(getConnectorInstance("sqlite").getDefaultCapabilities().writable).toBe(true);
    expect(getConnectorInstance("mongodb").getDefaultCapabilities().writable).toBe(true);
    expect(getConnectorInstance("rest").getDefaultCapabilities().writable).toBe(false);
  });

  it("REST connector implements write methods when capability enabled", () => {
    const rest = getConnectorInstance("rest");
    expect(typeof (rest as any).executeCreate).toBe("function");
  });

  it("throws for unknown connector types", () => {
    expect(() => getConnectorInstance("oracle" as any)).toThrow(FederationError);
  });
});
