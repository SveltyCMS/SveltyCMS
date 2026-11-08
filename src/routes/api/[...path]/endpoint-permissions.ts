/**
 * @file src/routes/api/[...path]/endpoint-permissions.ts
 * @description Single source of truth for the fail-closed namespace → permission
 * mapping used by the API dispatcher. The OpenAPI service imports it to publish
 * the complete namespace inventory (documented + undocumented).
 *
 * ### Features:
 * - Method-aware capabilities (read vs write) for every API namespace
 * - Shared by the catch-all dispatcher and the OpenAPI inventory
 */

// Fail-closed mapping of namespaces/methods to core SveltyCMS permission IDs
const isReadMethod = (m: string) => m === "GET" || m === "OPTIONS";

export const ENDPOINT_PERMISSIONS: Record<string, string | ((method: string) => string)> = {
  collections: (method: string) =>
    isReadMethod(method) ? "collections:read" : "collections:write",
  // Explicit drafts mapping: `/api/collections/:id/drafts…` resolves through
  // `collections`, and a future top-level `/api/drafts` namespace inherits the
  // same fail-closed collection read/write capability instead of being unmapped.
  drafts: (method: string) => (isReadMethod(method) ? "collections:read" : "collections:write"),
  "virtual-collections": (method: string) =>
    isReadMethod(method) ? "collection:read" : "collection:write",
  content: (method: string) => (isReadMethod(method) ? "collection:read" : "collection:write"),
  "content-structure": (method: string) =>
    isReadMethod(method) ? "collection:read" : "collection:write",
  search: "collection:read",
  events: "collection:read",
  graphql: (method: string) => (isReadMethod(method) ? "collection:read" : "collection:write"),
  media: (method: string) => {
    if (method === "OPTIONS" || method === "GET") return "media:read";
    if (method === "DELETE") return "media:delete";
    return "media:write";
  },
  widgets: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  system: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  settings: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  "system-settings": (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  importer: "config:importexport",
  "import-data": "config:importexport",
  import: "config:importexport",
  export: "config:importexport",
  ai: "ai:use",
  "ai-builder": "system:settings",
  automations: "config:automations",
  workflows: "config:automations",
  theme: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  "system-preferences": (method: string) =>
    isReadMethod(method) ? "systemPreferences:read" : "systemPreferences:write",
  token: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  "website-tokens": (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  webhooks: "config:webhooks",
  "system-webhooks": "config:webhooks",
  // Virtual folders are part of the media system (sidebar tree, folder CRUD,
  // drag-drop targets) — gate them with the media capabilities the media
  // endpoints use, not the admin-only `system:settings` capability.
  "system-virtual-folder": (method: string) =>
    method === "DELETE" ? "media:delete" : isReadMethod(method) ? "media:read" : "media:write",
  systemVirtualFolder: (method: string) =>
    method === "DELETE" ? "media:delete" : isReadMethod(method) ? "media:read" : "media:write",
  version: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  "version-check": (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  permission: "system:admin",
  "system-jobs": (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  dashboard: "dashboard:read",
  "openapi.json": (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  database: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  logs: "system:admin",
  "api-keys": (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  "remote-video": "collection:read",
  remoteVideo: "collection:read",

  // Data Operations permissions
  config: (method: string) => (method === "POST" ? "config:write" : "config:read"),
  "content-export": (method: string) => (method === "POST" ? "content:export" : "content:read"),
  "content-import": (method: string) => (method === "POST" ? "content:import" : "content:read"),
  migrations: (method: string) => (method === "POST" ? "migration:apply" : "migration:read"),
  importers: (method: string) => (method === "POST" ? "content:import" : "content:read"),
  backups: (method: string) => {
    if (method === "OPTIONS" || method === "GET") return "backup:read";
    if (method === "POST") return "backup:create";
    return "backup:read";
  },
  "content-sync": (method: string) => (method === "POST" ? "content:sync" : "content:read"),
  config_sync: (method: string) => (method === "POST" ? "config:write" : "config:read"),
  "config-sync": (method: string) => (method === "POST" ? "config:write" : "config:read"),

  // Plugin Settings (encrypted per-tenant settings, gated behind plugin:settings:manage)
  "plugin-settings": "plugin:settings:manage",

  // GDPR — authenticated self-service (handler enforces self-or-admin)
  gdpr: (method: string) => (isReadMethod(method) ? "user:read" : "user:write"),
  commerce: (method: string) => (isReadMethod(method) ? "collections:read" : "collections:write"),
  stripe: (method: string) => (isReadMethod(method) ? "collections:read" : "collections:write"),
  seo: "collection:read",
  chat: "ai:use",
  forms: (method: string) => (isReadMethod(method) ? "collections:read" : "collections:write"),

  // Utility / ops namespaces previously fail-closed to isAdmin() only because
  // they were missing from this map. Explicit mappings keep fail-closed for
  // unknown keys while letting the matching capability through.
  marketplace: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  "send-mail": "system:settings",
  // `/api/testing` is admin-only at the dispatcher. The E2E/integration harness
  // reaches it through `__testBypass` (x-test-secret), which skips this map; a
  // normal authenticated non-admin must not pass the namespace root gate.
  testing: "system:admin",
  trash: (method: string) => (isReadMethod(method) ? "collection:read" : "collection:write"),
  debug: "system:admin",
  cache: "system:admin",
  metrics: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  telemetry: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  security: "system:admin",
};
