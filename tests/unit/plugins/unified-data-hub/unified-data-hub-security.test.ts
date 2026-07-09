/**
 * @file tests/unit/plugins/unified-data-hub/unified-data-hub-security.test.ts
 * @description Security regression tests for Unified Data Hub (stable release gate).
 */

import { describe, expect, it } from "vitest";
import { FederationError } from "@plugins/unified-data-hub/types";
import { sanitizeConnector } from "@plugins/unified-data-hub/server/connector-registry";
import { assertVirtualWritePermission } from "@plugins/unified-data-hub/server/permission-engine";
import { rejectHybridQuery } from "@plugins/unified-data-hub/server/query-planner";
import {
  decodeSourceCursor,
  encodeSourceCursor,
} from "@plugins/unified-data-hub/server/federated-cursor";
import type { ConnectorRecord } from "@plugins/unified-data-hub/types";
import type { DatabaseId, ISODateString } from "@databases/db-interface";

const connector: ConnectorRecord = {
  _id: "c1" as unknown as DatabaseId,
  tenantId: "default" as unknown as DatabaseId,
  name: "Secret PG",
  type: "postgres",
  enabled: true,
  config: { host: "db.internal" },
  credentials: { username: "admin", password: "super-secret" },
  capabilities: {
    filterPushdown: true,
    sortPushdown: true,
    joinable: "same-source-only",
    maxPageSize: 100,
    supportsTransactions: false,
    staleness: "real-time",
    writable: true,
  },
  health: "ok",
  createdAt: "" as unknown as ISODateString,
  updatedAt: "" as unknown as ISODateString,
};

describe("Unified Data Hub security", () => {
  it("sanitizeConnector never exposes credentials", () => {
    const safe = sanitizeConnector(connector);
    expect(safe).not.toHaveProperty("credentials");
    expect(safe.name).toBe("Secret PG");
  });

  it("rejects hybrid native+virtual filter keys", () => {
    expect(() => rejectHybridQuery({ "_native.title": "x" })).toThrow(FederationError);
    expect(() => rejectHybridQuery({ title: "ok" })).not.toThrow();
  });

  it("assertVirtualWritePermission requires admin or collection:write", async () => {
    const collection = {
      slug: "articles",
      permissions: { write: ["collection:write"] },
    } as any;
    await expect(assertVirtualWritePermission({ role: "editor" }, [], collection)).rejects.toThrow(
      FederationError,
    );
    await expect(
      assertVirtualWritePermission({ role: "admin", isAdmin: true }, [], collection),
    ).resolves.toBeUndefined();
  });

  it("rejects tampered federation cursors", () => {
    const cursor = encodeSourceCursor({
      slug: "articles",
      connectorId: "c1",
      offset: 5,
    });
    expect(() => decodeSourceCursor(cursor, "articles", "c2")).toThrow(FederationError);
    expect(() => decodeSourceCursor("not-valid-cursor", "articles", "c1")).toThrow(FederationError);
  });
});
