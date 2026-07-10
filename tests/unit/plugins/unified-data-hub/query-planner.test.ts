/**
 * @file tests/unit/plugins/unified-data-hub/query-planner.test.ts
 * @description v1.5 query planner — AST normalization, capabilities, REST translation.
 */

import { describe, expect, it } from "vitest";
import type { DatabaseId, ISODateString } from "@databases/db-interface";
import type { ConnectorRecord, VirtualCollectionRecord } from "@plugins/unified-data-hub/types";
import { FederationError } from "@plugins/unified-data-hub/types";
import {
  normalizeVirtualQuery,
  planVirtualQuery,
  resolveEffectiveCapabilities,
  translateWordPressRestParams,
  translateWordPressRestSort,
} from "@plugins/unified-data-hub/server/query-planner";

const TENANT = "default" as DatabaseId;
const ISO_NOW = "2026-07-09T00:00:00.000Z" as ISODateString;

const wpCollection: VirtualCollectionRecord = {
  _id: "vc-1" as DatabaseId,
  tenantId: TENANT,
  name: "Articles",
  slug: "wp-articles",
  connectorId: "conn-1",
  source: { endpoint: "/wp-json/wp/v2/posts", platform: "wordpress" },
  fields: [
    { name: "title", label: "Title", sourceField: "title", type: "text" },
    { name: "slug", label: "Slug", sourceField: "slug", type: "text" },
    { name: "status", label: "Status", sourceField: "status", type: "text" },
    { name: "author", label: "Author", sourceField: "author", type: "number" },
  ],
  enabled: true,
  createdAt: ISO_NOW,
  updatedAt: ISO_NOW,
};

const restConnector: ConnectorRecord = {
  _id: "conn-1" as DatabaseId,
  tenantId: TENANT,
  name: "WP REST",
  type: "rest",
  enabled: true,
  config: { baseUrl: "http://127.0.0.1:18765" },
  allowedHosts: ["127.0.0.1"],
  capabilities: {
    filterPushdown: false,
    sortPushdown: false,
    joinable: false,
    maxPageSize: 100,
    supportsTransactions: false,
    staleness: "cache",
    ttlSeconds: 300,
    writable: false,
  },
  health: "ok",
  createdAt: ISO_NOW,
  updatedAt: ISO_NOW,
};

describe("query planner v1.5", () => {
  it("enables filter and sort pushdown for WordPress REST via effective capabilities", () => {
    const caps = resolveEffectiveCapabilities(restConnector, wpCollection);
    expect(caps.filterPushdown).toBe(true);
    expect(caps.sortPushdown).toBe(true);
  });

  it("translates WordPress sort to orderby/order params", () => {
    expect(
      translateWordPressRestSort({
        field: "date",
        sourceField: "date",
        direction: "desc",
      }),
    ).toEqual({ orderby: "date", order: "desc" });
    expect(
      translateWordPressRestSort({
        field: "author",
        sourceField: "author",
        direction: "asc",
      }),
    ).toEqual({});
  });

  it("plans query with WordPress sort params", () => {
    const planned = planVirtualQuery(
      {
        tenantId: TENANT,
        sort: { field: "title", direction: "asc" },
        limit: 10,
      },
      wpCollection,
      restConnector,
    );
    expect(planned.restQueryParams.orderby).toBe("title");
    expect(planned.restQueryParams.order).toBe("asc");
  });

  it("normalizes filter against virtual schema fields", () => {
    const ast = normalizeVirtualQuery(
      { tenantId: TENANT, filter: { slug: "hello", status: "publish" }, limit: 10 },
      wpCollection,
      restConnector,
    );
    expect(ast.filters).toHaveLength(2);
    expect(ast.filters[0].field).toBe("slug");
    expect(ast.limit).toBe(10);
  });

  it("rejects unknown filter fields", () => {
    expect(() =>
      normalizeVirtualQuery(
        { tenantId: TENANT, filter: { unknownField: "x" } },
        wpCollection,
        restConnector,
      ),
    ).toThrow(FederationError);
  });

  it("translates WordPress filters to REST params with client-side remainder", () => {
    const { params, clientFilters } = translateWordPressRestParams([
      { field: "slug", sourceField: "slug", operator: "eq", value: "hello-wp" },
      { field: "title", sourceField: "title", operator: "eq", value: "Hello" },
      { field: "author", sourceField: "author", operator: "eq", value: 42 },
    ]);
    expect(params).toEqual({ slug: "hello-wp", search: "Hello" });
    expect(clientFilters).toHaveLength(1);
    expect(clientFilters[0].field).toBe("author");
  });

  it("plans full query with REST params for WordPress", () => {
    const planned = planVirtualQuery(
      {
        tenantId: TENANT,
        filter: { slug: "fixture-post-1", author: 1 },
        limit: 5,
      },
      wpCollection,
      restConnector,
    );
    expect(planned.restQueryParams.slug).toBe("fixture-post-1");
    expect(planned.clientFilters).toHaveLength(1);
    expect(planned.request.limit).toBe(5);
  });

  it("clamps limit to connector maxPageSize", () => {
    const ast = normalizeVirtualQuery(
      { tenantId: TENANT, limit: 500 },
      wpCollection,
      restConnector,
    );
    expect(ast.limit).toBe(100);
    expect(ast.clamped).toBe(true);
  });
});
