/**
 * @file tests/unit/plugins/unified-data-hub/virtual-join.test.ts
 * @description v1.5 Phase B — same-source virtual join planner tests.
 */

import { describe, expect, it } from "vitest";
import type { DatabaseId, ISODateString } from "@databases/db-interface";
import type {
  ConnectorRecord,
  FederatedRow,
  VirtualCollectionRecord,
} from "@plugins/unified-data-hub/types";
import { FederationError } from "@plugins/unified-data-hub/types";
import {
  assertJoinKeyBudget,
  collectJoinKeys,
  mergeRelationIntoRows,
  resolveRelationsToInclude,
  validateJoinCapability,
} from "@plugins/unified-data-hub/server/virtual-join";

const connector: ConnectorRecord = {
  _id: "conn-1" as unknown as DatabaseId,
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
    ttlSeconds: 0,
    writable: true,
  },
  health: "ok",
  createdAt: "" as unknown as ISODateString,
  updatedAt: "" as unknown as ISODateString,
};

const articles: VirtualCollectionRecord = {
  _id: "vc-articles" as unknown as DatabaseId,
  tenantId: "default" as unknown as DatabaseId,
  name: "Articles",
  slug: "bench-articles",
  connectorId: "conn-1",
  source: { table: "articles", schema: "udh_fixture" },
  fields: [
    { name: "id", label: "ID", sourceField: "id", type: "number" },
    { name: "authorId", label: "Author", sourceField: "author_id", type: "number" },
  ],
  relations: [
    { name: "author", targetSlug: "bench-authors", localField: "authorId", foreignField: "id" },
  ],
  enabled: true,
  createdAt: "" as unknown as ISODateString,
  updatedAt: "" as unknown as ISODateString,
};

describe("virtual join v1.5 Phase B", () => {
  it("requires same-source-only joinable capability", () => {
    expect(() => validateJoinCapability(connector)).not.toThrow();
    expect(() =>
      validateJoinCapability({
        ...connector,
        capabilities: { ...connector.capabilities, joinable: false },
      }),
    ).toThrow(FederationError);
  });

  it("resolves include relation names", () => {
    const rels = resolveRelationsToInclude(articles, ["author"]);
    expect(rels).toHaveLength(1);
    expect(rels[0].targetSlug).toBe("bench-authors");
  });

  it("rejects unknown relation names", () => {
    expect(() => resolveRelationsToInclude(articles, ["missing"])).toThrow(FederationError);
  });

  it("collects distinct join keys from primary rows", () => {
    const rows: FederatedRow[] = [
      { _id: "a:1", _source: { connectorId: "conn-1", sourceKey: "1" }, authorId: 1 },
      { _id: "a:2", _source: { connectorId: "conn-1", sourceKey: "2" }, authorId: 1 },
      { _id: "a:3", _source: { connectorId: "conn-1", sourceKey: "3" }, authorId: 2 },
    ];
    expect(collectJoinKeys(rows, "authorId")).toEqual(["1", "2"]);
  });

  it("merges related rows into _relations", () => {
    const primary: FederatedRow[] = [
      { _id: "a:1", _source: { connectorId: "conn-1", sourceKey: "1" }, authorId: 10 },
    ];
    const related: FederatedRow[] = [
      { _id: "c:10", _source: { connectorId: "conn-1", sourceKey: "10" }, id: 10, name: "Ada" },
    ];
    const merged = mergeRelationIntoRows(primary, "author", "authorId", "id", related);
    expect(merged[0]._relations?.author?.name).toBe("Ada");
  });

  it("enforces join key budget", () => {
    expect(() => assertJoinKeyBudget(501)).toThrow(FederationError);
  });
});
