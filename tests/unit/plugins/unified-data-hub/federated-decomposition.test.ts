/**
 * @file tests/unit/plugins/unified-data-hub/federated-decomposition.test.ts
 * @description v3.0 alpha decomposition tree planner tests.
 */

import { describe, expect, it } from "vitest";
import { FederationError } from "@plugins/unified-data-hub/types";
import type { ConnectorRecord, VirtualCollectionRecord } from "@plugins/unified-data-hub/types";
import type { DatabaseId, ISODateString } from "@databases/db-interface";
import {
  assertDecompositionExecutable,
  buildDecompositionPlan,
  detectCrossSourceConnectors,
} from "@plugins/unified-data-hub/server/federated-decomposition";

const postgresConnector: ConnectorRecord = {
  _id: "c1" as unknown as DatabaseId,
  tenantId: "default" as unknown as DatabaseId,
  name: "PG",
  type: "postgres",
  enabled: true,
  config: {},
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

const restConnector: ConnectorRecord = {
  ...postgresConnector,
  _id: "c2" as unknown as DatabaseId,
  type: "rest",
  capabilities: {
    ...postgresConnector.capabilities,
    joinable: false,
    filterPushdown: false,
    sortPushdown: false,
    staleness: "cache",
    writable: false,
  },
};

function makeCollection(slug: string, connectorId: string): VirtualCollectionRecord {
  return {
    _id: slug as unknown as DatabaseId,
    tenantId: "default" as unknown as DatabaseId,
    name: slug,
    slug,
    connectorId,
    source: { table: slug },
    fields: [{ name: "id", label: "ID", sourceField: "id", type: "number" }],
    enabled: true,
    createdAt: "" as unknown as ISODateString,
    updatedAt: "" as unknown as ISODateString,
  };
}

describe("federated decomposition v3 alpha", () => {
  it("detects cross-source connector sets", () => {
    expect(detectCrossSourceConnectors(["c1", "c1"])).toBe(false);
    expect(detectCrossSourceConnectors(["c1", "c2"])).toBe(true);
  });

  it("builds single-source passthrough plan", () => {
    const plan = buildDecompositionPlan({
      primary: makeCollection("articles", "c1"),
      primaryConnector: postgresConnector,
      options: { tenantId: "default", limit: 10 },
    });
    expect(plan.crossSource).toBe(false);
    expect(plan.subExpressions).toHaveLength(1);
    expect(plan.version).toBe("3.0-stable");
    expect(plan.mergeStrategy).toBe("passthrough");
    expect(plan.cursorModel).toBe("none");
    assertDecompositionExecutable(plan);
  });

  it("builds same-source join plan with hash-join strategy", () => {
    const plan = buildDecompositionPlan({
      primary: makeCollection("articles", "c1"),
      primaryConnector: postgresConnector,
      options: { tenantId: "default", limit: 10 },
      joinTargets: [
        {
          relation: {
            name: "author",
            targetSlug: "authors",
            localField: "authorId",
            foreignField: "id",
          },
          collection: makeCollection("authors", "c1"),
          connector: postgresConnector,
        },
      ],
    });
    expect(plan.crossSource).toBe(false);
    expect(plan.subExpressions).toHaveLength(2);
    expect(plan.mergeStrategy).toBe("hash-join");
    assertDecompositionExecutable(plan);
  });

  it("flags cross-source decomposition and blocks execution without alpha", () => {
    const plan = buildDecompositionPlan({
      primary: makeCollection("articles", "c1"),
      primaryConnector: postgresConnector,
      options: { tenantId: "default" },
      joinTargets: [
        {
          relation: {
            name: "wpAuthor",
            targetSlug: "wp-authors",
            localField: "authorId",
            foreignField: "id",
          },
          collection: makeCollection("wp-authors", "c2"),
          connector: restConnector,
        },
      ],
    });
    expect(plan.crossSource).toBe(true);
    expect(plan.cursorModel).toBe("per-source");
    expect(() => assertDecompositionExecutable(plan)).toThrow(FederationError);
  });
});
