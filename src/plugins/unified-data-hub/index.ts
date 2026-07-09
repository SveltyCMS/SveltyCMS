/**
 * @file src/plugins/unified-data-hub/index.ts
 * @description Unified Data Hub — governed multi-source data federation plugin.
 *
 * Connects external databases and REST APIs as virtual collections with
 * LocalCMS-first reads, RBAC, SSRF protection, and WebMCP agent integration.
 *
 * ### Licensing:
 * - Community: 1 connector, 3 virtual collections
 * - Pro: unlimited connectors, WebMCP virtual tools, SaaS connectors
 *
 * ### Features:
 * - Postgres, MariaDB, SQLite, MongoDB, and REST connectors (v2.3)
 * - Passthrough virtual query engine (single-source)
 * - LocalCMS virtualCollections namespace
 * - Conditional config_grid tile + plugin_workspace UI
 * - WebMCP topology extension
 * - Single-source write-back for SQL/Mongo connectors (REST read-only)
 * - Draft-by-Default: WebMCP tools remain read-only (no agent writes)
 */

import type { Plugin } from "../types";
export { unifiedDataHubHeadlessContracts } from "./headless-contracts";

export const unifiedDataHubPlugin: Plugin = {
  metadata: {
    id: "unified-data-hub",
    name: "Unified Data Hub",
    version: "2.4.0",
    description:
      "Governed multi-source data federation — Postgres, MariaDB, SQLite, MongoDB, and opt-in REST write-back virtual collections with same-source joins, native stitch enrich, and optional cross-source alpha.",
    author: "SveltyCMS",
    icon: "mdi:database-sync",
    enabled: false,
    category: "data-platform",
    capabilities: ["db:read", "db:write", "network:fetch", "ui:slot", "ui:page", "event:subscribe"],
  },
  config: {
    public: {
      maxConnectorsFree: 1,
      maxVirtualCollectionsFree: 3,
      enableWebMcpTools: true,
      crossSourceAlpha: false,
    },
    private: {
      licenseKey: "",
      enableCrossSourceAlpha: false,
    },
  },
  ui: {
    slots: [
      {
        id: "hub-config-tile",
        zone: "config_grid",
        position: 20,
        component: () => import("./components/config-tile.svelte").then((m) => m.default as any),
        permissions: ["admin"],
        props: { pluginId: "unified-data-hub" },
        condition: (ctx: { pluginStates?: Record<string, boolean> }) =>
          ctx?.pluginStates?.["unified-data-hub"] ?? false,
      },
      {
        id: "connector-health",
        zone: "dashboard",
        position: 25,
        component: () =>
          import("./components/connector-health-widget.svelte").then((m) => m.default as any),
        permissions: ["admin"],
        condition: (ctx: { pluginStates?: Record<string, boolean> }) =>
          ctx?.pluginStates?.["unified-data-hub"] ?? false,
      },
      {
        id: "hub-workspace",
        zone: "plugin_workspace",
        position: 0,
        component: () => import("./components/hub-workspace.svelte").then((m) => m.default as any),
        server: import.meta.env.SSR ? () => import("./hub-page.server") as any : undefined,
        permissions: ["admin"],
        condition: (ctx: { activePluginId?: string }) => ctx?.activePluginId === "unified-data-hub",
      },
      {
        id: "federation-enrichment-picker",
        zone: "collection_builder",
        position: 10,
        component: () =>
          import("./components/federation-enrichment-picker.svelte").then((m) => m.default as any),
        permissions: ["admin"],
        condition: (ctx: { isCollectionEditor?: boolean }) => ctx?.isCollectionEditor === true,
      },
      {
        id: "virtual-entry-preview",
        zone: "entry_edit_sidebar",
        position: 45,
        component: () =>
          import("./components/virtual-entry-preview.svelte").then((m) => m.default as any),
        condition: (ctx: { collection?: { federationEnrichments?: unknown[] } }) =>
          Array.isArray(ctx?.collection?.federationEnrichments) &&
          ctx.collection.federationEnrichments.length > 0,
      },
    ],
  },
  enabledCollections: [
    "plugin_unified-data-hub_connectors",
    "plugin_unified-data-hub_virtual_schemas",
    "plugin_unified-data-hub_federation_audit",
  ],
};

export default unifiedDataHubPlugin;
