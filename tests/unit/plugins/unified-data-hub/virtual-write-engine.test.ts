/**
 * @file tests/unit/plugins/unified-data-hub/virtual-write-engine.test.ts
 * @description Virtual write engine permission and capability gate tests.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { DatabaseId } from "@databases/db-interface";
import { FederationError } from "@plugins/unified-data-hub/types";
import { PostgresConnector } from "@plugins/unified-data-hub/server/connectors/postgres";
import { executeVirtualWrite } from "@plugins/unified-data-hub/server/virtual-write-engine";

vi.mock("@src/utils/license-manager", () => ({
  checkExtensionLicense: vi.fn(async () => ({
    active: true,
    hasLicense: false,
    daysRemaining: 14,
  })),
}));

const TENANT = "default";
const CONNECTOR_ID = "conn-pg-1" as DatabaseId;
const COLLECTION_ID = "vc-articles" as DatabaseId;

const writableConnector = {
  _id: CONNECTOR_ID,
  tenantId: TENANT,
  name: "PG",
  type: "postgres" as const,
  enabled: true,
  config: { host: "127.0.0.1", database: "test" },
  capabilities: {
    filterPushdown: true,
    sortPushdown: true,
    joinable: false as const,
    maxPageSize: 100,
    supportsTransactions: false,
    staleness: "real-time" as const,
    writable: true,
  },
  health: "ok" as const,
  createdAt: "2026-07-09T00:00:00.000Z",
  updatedAt: "2026-07-09T00:00:00.000Z",
};

const restConnector = {
  ...writableConnector,
  _id: "conn-rest" as DatabaseId,
  type: "rest" as const,
  capabilities: { ...writableConnector.capabilities, writable: false, staleness: "cache" as const },
};

const collection = {
  _id: COLLECTION_ID,
  tenantId: TENANT,
  name: "Articles",
  slug: "articles",
  connectorId: CONNECTOR_ID,
  source: { table: "articles", schema: "public" },
  fields: [
    { name: "id", label: "ID", sourceField: "id", type: "number" },
    { name: "title", label: "Title", sourceField: "title", type: "text" },
  ],
  permissions: { read: ["collection:read"], write: ["collection:write"] },
  enabled: true,
  createdAt: "2026-07-09T00:00:00.000Z",
  updatedAt: "2026-07-09T00:00:00.000Z",
};

function createMockDb(connector = writableConnector) {
  return {
    crud: {
      findOne: vi.fn(async (col: string, query: any) => {
        if (col === "plugin_unified-data-hub_virtual_schemas") {
          if (query._id === COLLECTION_ID || query.slug === "articles") {
            return { success: true, data: collection };
          }
        }
        if (col === "plugin_unified-data-hub_connectors") {
          if (query._id === connector._id) {
            return { success: true, data: connector };
          }
        }
        return { success: true, data: null };
      }),
      insert: vi.fn(async () => ({ success: true })),
    },
  } as any;
}

describe("virtual write engine", () => {
  let executeWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    executeWriteSpy = vi.spyOn(PostgresConnector.prototype, "executeWrite").mockResolvedValue({
      _id: `${CONNECTOR_ID}:42`,
      _source: { connectorId: String(CONNECTOR_ID), sourceKey: "42" },
      title: "Created",
    });
  });

  afterEach(() => {
    executeWriteSpy.mockRestore();
  });

  it("denies write without collection:write permission", async () => {
    const db = createMockDb();
    await expect(
      executeVirtualWrite(
        db,
        "articles",
        "create",
        { tenantId: TENANT, user: { _id: "u1", role: "editor" }, data: { title: "x" } },
        undefined,
        [],
      ),
    ).rejects.toThrow(FederationError);
  });

  it("allows admin write and returns federated row", async () => {
    const db = createMockDb();
    const result = await executeVirtualWrite(
      db,
      "articles",
      "create",
      {
        tenantId: TENANT,
        user: { _id: "admin", role: "admin", isAdmin: true },
        data: { title: "Hello" },
      },
      undefined,
      [],
    );
    expect(result.meta.operation).toBe("create");
    expect(result.data?.title).toBe("Created");
    expect(executeWriteSpy).toHaveBeenCalled();
  });

  it("rejects writes on non-writable REST connector", async () => {
    const db = createMockDb(restConnector);
    const restCollection = { ...collection, connectorId: "conn-rest" };
    db.crud.findOne = vi.fn(async (col: string) => {
      if (col === "plugin_unified-data-hub_virtual_schemas") {
        return { success: true, data: restCollection };
      }
      if (col === "plugin_unified-data-hub_connectors") {
        return { success: true, data: restConnector };
      }
      return { success: true, data: null };
    });

    await expect(
      executeVirtualWrite(
        db,
        "articles",
        "create",
        {
          tenantId: TENANT,
          user: { role: "admin", isAdmin: true },
          data: { title: "x" },
        },
        undefined,
        [],
      ),
    ).rejects.toMatchObject({ code: "CONNECTOR_WRITE_NOT_SUPPORTED" });
  });
});
