/**
 * @file src/plugins/unified-data-hub/headless-contracts.ts
 * @description Headless API contracts for decoupled frontends (plugin architecture § Headless Delivery).
 *
 * External apps consume documented REST/GraphQL endpoints — no Svelte dependency.
 *
 * Features:
 * - Virtual slot schemas for federation enrich previews
 * - Stateless read endpoint catalog with RBAC notes
 * - WebMCP tool parity references
 */

export interface HeadlessVirtualSlot {
  id: string;
  zone: string;
  schema: Record<string, unknown>;
  endpoint: string;
  method: "GET";
}

export interface HeadlessApiEndpoint {
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  description: string;
  queryParams?: string[];
  responseHeaders?: string[];
  rbac: string;
}

export const unifiedDataHubVirtualSlots: HeadlessVirtualSlot[] = [
  {
    id: "headless-federation-row",
    zone: "collection_item",
    schema: {
      type: "object",
      properties: {
        _id: { type: "string" },
        connectorId: { type: "string" },
        sourceKey: { type: "string" },
        fields: { type: "object", additionalProperties: true },
        _relations: { type: "object", additionalProperties: true },
      },
    },
    endpoint: "/api/virtual-collections/{slug}",
    method: "GET",
  },
  {
    id: "headless-federation-enrich",
    zone: "entry_edit_sidebar",
    schema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          additionalProperties: {
            type: "object",
            nullable: true,
          },
        },
        meta: {
          type: "object",
          properties: {
            keyCount: { type: "number" },
            matched: { type: "number" },
            stitchWarning: { type: "boolean" },
            staleness: { type: "string" },
          },
        },
      },
    },
    endpoint: "/api/virtual-collections/{slug}/enrich",
    method: "GET",
  },
];

export const unifiedDataHubApiEndpoints: HeadlessApiEndpoint[] = [
  {
    path: "/api/virtual-collections",
    method: "GET",
    description: "List virtual collection schemas for the active tenant",
    rbac: "collection:read",
  },
  {
    path: "/api/virtual-collections/{slug}",
    method: "GET",
    description: "Paginated federated read with optional same-source include and per-source cursor",
    queryParams: [
      "limit",
      "offset",
      "cursor",
      "include",
      "sortField",
      "sortDirection",
      "filter",
      "bypassCache",
    ],
    responseHeaders: [
      "X-Federation-Next-Cursor",
      "X-Federation-Clamped",
      "X-Federation-Stitch-Warning",
      "X-Federation-Near-Budget",
    ],
    rbac: "collection:read",
  },
  {
    path: "/api/virtual-collections/{slug}/enrich",
    method: "GET",
    description: "Batch native-key stitch enrich map",
    queryParams: ["keys", "field", "bypassCache"],
    responseHeaders: ["X-Federation-Stitch-Warning", "X-Federation-Near-Budget"],
    rbac: "collection:read",
  },
  {
    path: "/api/virtual-collections/{slug}/{entryId}",
    method: "GET",
    description: "Single virtual entry by federated id or source key",
    rbac: "collection:read",
  },
  {
    path: "/api/virtual-collections/health/{connectorId}",
    method: "GET",
    description: "Connector health probe (sanitized — no credentials)",
    rbac: "collection:read",
  },
  {
    path: "/api/virtual-collections/{slug}",
    method: "POST",
    description: "Create virtual entry (SQL/Mongo writable connectors only)",
    rbac: "collection:write",
  },
  {
    path: "/api/virtual-collections/{slug}/{entryId}",
    method: "PATCH",
    description: "Update virtual entry by federated id or source key",
    rbac: "collection:write",
  },
  {
    path: "/api/virtual-collections/{slug}/{entryId}",
    method: "DELETE",
    description: "Delete virtual entry by federated id or source key",
    rbac: "collection:write",
  },
];

export const unifiedDataHubHeadlessContracts = {
  pluginId: "unified-data-hub",
  version: "2.4.0",
  readOnly: false,
  virtualSlots: unifiedDataHubVirtualSlots,
  endpoints: unifiedDataHubApiEndpoints,
  graphql: {
    queries: ["virtualCollections", "virtualCollection", "virtualEnrich"],
    mutations: ["createVirtualEntry", "updateVirtualEntry", "deleteVirtualEntry"],
    notes:
      "GraphQL mirrors REST meta on reads; write mutations accept JSON payload string (same shape as VirtualFederationRow.payload)",
  },
  webmcp: {
    tools: ["list_virtual_collections", "query_virtual_collection", "enrich_virtual_collection"],
    topology: ["discoverTopology", "getContentGraph"],
  },
  adminApi: {
    base: "/api/plugins/unified-data-hub",
    actions: [
      "listConnectors",
      "saveConnector",
      "testConnector",
      "listVirtualCollections",
      "saveVirtualCollection",
      "getTierLimits",
      "getHealthSummary",
      "getHeadlessContracts",
    ],
    rbac: "plugins:execute (admin fast-path)",
  },
};
