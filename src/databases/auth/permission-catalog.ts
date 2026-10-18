/**
 * @file src/databases/auth/permission-catalog.ts
 * @description Canonical permission catalog for SveltyCMS.
 *
 * Every permission identifier that participates in authorization — core
 * permissions, 64-bit bitmask entries, capability-registry entries, built-in
 * role grants, API endpoint keys and endpoint-dispatch gates — resolves through
 * this catalog. Consumers derive their own tables from `PERMISSION_CATALOG`
 * instead of maintaining parallel string lists, so a new permission cannot be
 * added to one surface while silently missing from another.
 *
 * ### Features:
 * - Single `PERMISSION_CATALOG` with id, category, bit index, aliases and
 *   description.
 * - Canonical alias resolution (`collections:create` → `collections:write`,
 *   `users:read` → `user:read`, kebab-case API keys → camelCase ids).
 * - Derived `PERMISSION_CATALOG_BY_ID`, `PERMISSION_ALIASES` and
 *   `DEFAULT_ROLE_GRANTS` lookups for consumers.
 * - Explicit `endpoint:authenticated` sentinel for wildcard (`*`) API entries.
 */

export type PermissionCategory =
  | "system"
  | "dashboard"
  | "user"
  | "tenant"
  | "collections"
  | "content"
  | "media"
  | "config"
  | "api"
  | "ai"
  | "admin"
  | "backup"
  | "migration"
  | "token"
  | "plugin"
  | "workflow"
  | "graphql"
  | "webhook";

export interface PermissionCatalogEntry {
  /** Canonical permission id (string-compatible with every existing gate). */
  readonly id: string;
  /** Coarse grouping used by documentation and access-management UIs. */
  readonly category: PermissionCategory;
  /** Human-readable description. */
  readonly description: string;
  /** Fixed 64-bit mask index when this permission is bitmask-evaluable. */
  readonly bitIndex?: number;
  /** Alternative ids that resolve to this canonical id. */
  readonly aliases?: readonly string[];
  /** Included in `CORE_CAPABILITIES` (owner auto-inheritance). */
  readonly capability?: boolean;
}

interface PermissionEntryOptions {
  readonly bitIndex?: number;
  readonly aliases?: readonly string[];
  readonly capability?: boolean;
}

function entry(
  id: string,
  category: PermissionCategory,
  description: string,
  options: PermissionEntryOptions = {},
): PermissionCatalogEntry {
  return { id, category, description, ...options };
}

/**
 * Sentinel used by `ENDPOINT_PERMISSIONS` for namespaces whose API-level
 * permission is `"*"` (any authenticated principal, no specific grant).
 * Kept as a real catalog id so endpoint maps stay fully resolvable.
 */
export const AUTHENTICATED_ENDPOINT_PERMISSION = "endpoint:authenticated";

export const PERMISSION_CATALOG: readonly PermissionCatalogEntry[] = [
  // ── System ──────────────────────────────────────────────────────────────
  entry("system:admin", "system", "Full administrative control over the CMS.", {
    bitIndex: 0,
    capability: true,
  }),
  entry("system:dashboard", "system", "Access to the main administration dashboard.", {
    bitIndex: 1,
  }),
  entry("system:settings", "system", "View and change system-wide settings.", {
    bitIndex: 2,
    capability: true,
  }),
  entry("system:read", "system", "Read system-level resources such as tokens and themes.", {
    bitIndex: 3,
    capability: true,
  }),
  entry("system:write", "system", "Create and update system-level resources."),
  entry("system:delete", "system", "Delete system-level resources."),
  entry("systemPreferences:read", "system", "Read stored system preferences.", {
    bitIndex: 29,
    capability: true,
  }),
  entry("systemPreferences:write", "system", "Create and update system preferences.", {
    bitIndex: 30,
    capability: true,
  }),
  entry("send-mail:write", "system", "Send email through the configured mail service.", {
    bitIndex: 31,
  }),
  entry("permissions:update", "system", "Modify role permissions in Access Management.", {
    bitIndex: 32,
  }),
  entry("search:read", "system", "Use the global admin search across pages and collections."),
  entry("graphql:read", "graphql", "Execute read queries against the GraphQL API."),
  entry(AUTHENTICATED_ENDPOINT_PERMISSION, "system", "Any authenticated principal (API wildcard)."),

  // ── Tenants ─────────────────────────────────────────────────────────────
  entry("tenant:create", "tenant", "Provision new tenants (multi-tenant mode)."),
  entry("tenant:read", "tenant", "View tenants and their metadata."),
  entry("tenant:update", "tenant", "Edit tenant settings."),
  entry("tenant:delete", "tenant", "Delete tenants and their data."),
  entry("tenant:manage", "tenant", "Full control over tenants."),

  // ── Dashboard ───────────────────────────────────────────────────────────
  entry("dashboard:read", "dashboard", "View dashboard widgets and their metrics.", {
    bitIndex: 26,
    capability: true,
  }),
  entry("dashboard:write", "dashboard", "Create and save dashboard widget configurations.", {
    bitIndex: 27,
  }),
  entry("dashboard:update", "dashboard", "Edit existing dashboard widget layouts.", {
    bitIndex: 28,
  }),

  // ── Users & roles ───────────────────────────────────────────────────────
  entry("user:read", "user", "View the user list and individual user details.", {
    bitIndex: 12,
    capability: true,
    aliases: ["users:read"],
  }),
  entry("user:write", "user", "Edit user accounts and assign roles.", {
    bitIndex: 13,
    capability: true,
    aliases: ["users:write"],
  }),
  entry("user:delete", "user", "Delete user accounts.", {
    bitIndex: 14,
    capability: true,
  }),
  entry("user:create", "user", "Create new user accounts."),
  entry("user:update", "user", "Edit user accounts."),
  entry("user:manage", "user", "Full control over users: create, edit, assign roles, delete.", {
    capability: true,
  }),
  entry("user.create", "user", "Create new user registration tokens."),
  entry("users:delete", "user", "Delete user records."),

  // ── Collections (definitions) ───────────────────────────────────────────
  entry("collections:read", "collections", "View collection definitions and schemas.", {
    bitIndex: 4,
    capability: true,
  }),
  entry(
    "collections:write",
    "collections",
    "Create and modify collection definitions (create/update/delete aliases).",
    {
      bitIndex: 5,
      capability: true,
      // A mutation of a collection definition always requires the write gate;
      // the granular verbs are aliases so roles never hold a weaker grant.
      aliases: ["collections:create", "collections:update", "collections:delete"],
    },
  ),
  entry("collections:read_drafts", "collections", "View draft entries inside collections."),

  // ── Content entries ─────────────────────────────────────────────────────
  entry("collection:read", "content", "View entries inside collections.", {
    bitIndex: 6,
    capability: true,
  }),
  entry("collection:write", "content", "Create and update entries inside collections.", {
    bitIndex: 7,
    capability: true,
  }),
  entry("collection:delete", "content", "Delete entries inside collections.", {
    bitIndex: 8,
    capability: true,
  }),
  entry("collection:create", "content", "Create new entries inside collections."),
  entry("collection:update", "content", "Edit existing collection entries."),
  entry("content:read", "content", "Read content directly.", { bitIndex: 15 }),
  entry("content:write", "content", "Write content directly.", { bitIndex: 16 }),
  entry("content:delete", "content", "Delete content directly.", { bitIndex: 17 }),
  entry("content:export", "content", "Export content packages.", {
    bitIndex: 18,
    capability: true,
  }),
  entry("content:import", "content", "Import content packages.", {
    bitIndex: 19,
    capability: true,
  }),
  entry("content:sync", "content", "Synchronize content between environments.", {
    bitIndex: 20,
    capability: true,
  }),
  entry("content:editor", "content", "Create and edit content in the visual editor."),
  entry("content:builder", "content", "Build and edit collection schemas in Collection Builder."),
  entry("content:images", "content", "Manage images attached to content."),
  entry("content:read_drafts", "content", "View draft content."),

  // ── Media ───────────────────────────────────────────────────────────────
  entry("media:read", "media", "View and browse media library files.", {
    bitIndex: 9,
    capability: true,
  }),
  entry("media:write", "media", "Upload and edit media files.", {
    bitIndex: 10,
    capability: true,
  }),
  entry("media:delete", "media", "Permanently delete media files.", {
    bitIndex: 11,
    capability: true,
  }),

  // ── Configuration ───────────────────────────────────────────────────────
  entry("config:read", "config", "Read configuration values.", {
    bitIndex: 21,
    capability: true,
  }),
  entry("config:write", "config", "Write configuration values.", {
    bitIndex: 22,
    capability: true,
  }),
  entry("config:importexport", "config", "Import and export content and configuration.", {
    bitIndex: 23,
    capability: true,
  }),
  entry("config:automations", "config", "Create and manage event-driven automations.", {
    bitIndex: 24,
    capability: true,
  }),
  entry("config:webhooks", "config", "Configure outgoing webhook callbacks.", {
    bitIndex: 25,
    capability: true,
  }),
  entry("config:settings", "config", "Change system settings from the admin area.", {
    capability: true,
  }),
  entry("config:collectionManagement", "config", "Manage collection definitions from settings.", {
    capability: true,
  }),
  entry(
    "config:collectionbuilder",
    "config",
    "Use Collection Builder to create and edit schemas.",
    {
      capability: true,
    },
  ),
  entry("config:graphql", "config", "Configure the GraphQL API settings.", { capability: true }),
  entry("config:imageeditor", "config", "Configure the built-in image editor.", {
    capability: true,
  }),
  entry("config:dashboard", "config", "Configure dashboard widgets and layout.", {
    capability: true,
  }),
  entry("config:widgetManagement", "config", "Install, configure and remove widgets.", {
    capability: true,
  }),
  entry("config:themeManagement", "config", "Manage admin themes and design tokens.", {
    capability: true,
  }),
  entry("config:accessManagement", "config", "Manage roles, permissions and access tokens.", {
    capability: true,
  }),
  entry("config:emailPreviews", "config", "Preview and manage email templates.", {
    capability: true,
  }),
  entry("config:adminArea", "config", "Manage the admin-area configuration.", {
    capability: true,
  }),
  entry("config:audit", "config", "View the system audit log."),
  entry("config:synchronization", "config", "Import and export configuration for synchronization."),
  entry("config:systemHealth", "config", "View system health, metrics and diagnostics."),
  entry("config:extensions", "config", "Install and manage plugins and extensions."),
  entry("config:marketplace", "config", "Browse and install from the extensions marketplace."),

  // ── API ─────────────────────────────────────────────────────────────────
  entry("api:token", "api", "Manage invitation and API tokens.", { bitIndex: 39 }),
  entry("api:user", "api", "Access endpoints under /api/user/.", { capability: true }),
  entry("api:exportData", "api", "Access the data export API endpoint.", {
    capability: true,
    aliases: ["api:export-data"],
  }),
  entry("api:graphql", "api", "Access the GraphQL API endpoint."),
  entry("api:collections", "api", "Access the collections API endpoints."),
  entry("api:export", "api", "Access the content export endpoints."),
  entry("api:send-mail", "api", "Send email through the API."),
  entry("api:query", "api", "Access the query API endpoint."),
  entry("api:systemPreferences", "api", "Access the system-preferences API endpoints.", {
    aliases: ["api:system-preferences"],
  }),
  entry("api:systemInfo", "api", "Access system information API endpoints."),
  entry("api:userActivity", "api", "Access the user-activity API endpoint."),
  entry("api:media", "api", "Access the media API endpoints."),
  entry("api:widgets", "api", "Access widget-management API endpoints."),
  entry("api:config", "api", "System configuration endpoint (/api/config)."),
  entry("api:permission", "api", "Permission-management endpoint (/api/permission)."),
  entry("api:settings", "api", "Database-driven settings endpoint (/api/settings)."),
  entry("api:system-settings", "api", "System settings import/export endpoint."),
  entry("api:config-sync", "api", "Configuration sync endpoint."),
  entry("api:import", "api", "Full system import endpoint."),
  entry("api:import-data", "api", "Collection import endpoint (/api/import-data)."),
  entry("api:system", "api", "System status endpoint (/api/system)."),
  entry("api:system/health", "api", "Public health-check endpoint."),
  entry("api:system/prewarm-route", "api", "Predictive preload route-warming endpoint."),
  entry("api:system/penalize-bounce", "api", "Client navigation bounce telemetry endpoint."),
  entry("api:system/license-status", "api", "Extension license verification endpoint."),
  entry("api:telemetry", "api", "System telemetry endpoint."),
  entry("api:admin", "api", "Admin-area API endpoint."),
  entry("api:website-tokens", "api", "Website-token management endpoint."),
  entry("api:api-keys", "api", "Machine-to-machine API-key endpoint."),
  entry("api:auth", "api", "Authentication and 2FA endpoint."),
  entry("api:events", "api", "Real-time collaboration stream endpoint."),
  entry("api:system-virtual-folder", "api", "System virtual-folder endpoint."),
  entry("api:dashboard", "api", "Dashboard data endpoint."),
  entry("api:security", "api", "Security monitoring endpoint."),
  entry("api:search", "api", "Search endpoint."),
  entry("api:index", "api", "Index/search operations endpoint."),
  entry("api:metrics", "api", "Performance metrics endpoint."),
  entry("api:cache", "api", "Cache-management endpoint."),
  entry("api:version-check", "api", "Version/update-check endpoint."),
  entry("api:content-structure", "api", "Content-structure management endpoint."),
  entry("api:content", "api", "Content version and management endpoint."),
  entry("api:seo", "api", "Internal link suggestions and SEO tools endpoint."),
  entry("api:chat", "api", "AI assistant and collaboration chat endpoint."),
  entry("api:theme", "api", "Theme management endpoint."),
  entry("api:video", "api", "Video-processing endpoint."),
  entry("api:marketplace", "api", "Extensions marketplace endpoint."),
  entry("api:testing", "api", "Integration-testing endpoint."),
  entry("api:settings/public", "api", "Public system settings endpoint."),
  entry("api:get-tokens-provided", "api", "Token-information endpoint."),

  // ── AI ──────────────────────────────────────────────────────────────────
  entry("ai:use", "ai", "Use AI assistant, enrichment, translation and scoring endpoints.", {
    bitIndex: 43,
  }),
  entry("ai:admin", "ai", "Administer AI providers, models and budgets.", { bitIndex: 44 }),

  // ── Admin ───────────────────────────────────────────────────────────────
  entry("admin:access", "admin", "Grants access to the admin area.", { capability: true }),

  // ── Backup / migration ──────────────────────────────────────────────────
  entry("backup:read", "backup", "List and download backups.", {
    bitIndex: 35,
    capability: true,
  }),
  entry("backup:create", "backup", "Create database backups.", {
    bitIndex: 36,
    capability: true,
  }),
  entry("migration:read", "migration", "View database migration status.", {
    bitIndex: 33,
    capability: true,
  }),
  entry("migration:apply", "migration", "Apply database migrations.", {
    bitIndex: 34,
    capability: true,
  }),

  // ── Tokens / plugins / workflow / webhooks ──────────────────────────────
  entry("token:create", "token", "Create API and invitation tokens.", { capability: true }),
  entry("plugin:settings:manage", "plugin", "Manage encrypted per-tenant plugin settings.", {
    bitIndex: 37,
    capability: true,
  }),
  entry("plugins:execute", "plugin", "Execute plugin actions.", {
    bitIndex: 38,
    capability: true,
  }),
  entry("workflow:transition", "workflow", "Transition workflow states.", { bitIndex: 40 }),
  entry("graphql", "graphql", "Legacy GraphQL API permission bit.", { bitIndex: 41 }),
  entry("webhooks", "webhook", "Legacy webhook permission bit.", { bitIndex: 42 }),
];

/** O(1) canonical-entry lookup by id (aliases are not included). */
export const PERMISSION_CATALOG_BY_ID: ReadonlyMap<string, PermissionCatalogEntry> = new Map(
  PERMISSION_CATALOG.map((catalogEntry) => [catalogEntry.id, catalogEntry]),
);

/** Alias → canonical id, derived from each catalog entry's `aliases`. */
export const PERMISSION_ALIASES: Readonly<Record<string, string>> = (() => {
  const aliases: Record<string, string> = {};
  for (const catalogEntry of PERMISSION_CATALOG) {
    for (const alias of catalogEntry.aliases ?? []) {
      aliases[alias] = catalogEntry.id;
    }
  }
  return Object.freeze(aliases);
})();

/**
 * Resolve an alias to its canonical catalog id. Unknown ids are returned
 * unchanged so gates stay string-compatible with dynamic/plugin permissions.
 */
export function resolvePermissionId(permissionId: string): string {
  return PERMISSION_ALIASES[permissionId] ?? permissionId;
}

/** Whether an id (canonical or alias) exists in the catalog. */
export function isCatalogPermissionId(permissionId: string): boolean {
  return PERMISSION_CATALOG_BY_ID.has(resolvePermissionId(permissionId));
}

/**
 * Built-in role grants. Kept next to the catalog so a role can never reference
 * an id the catalog does not know about (enforced by
 * `tests/unit/security/permission-registry-consistency.test.ts`).
 *
 * `collections:create` / `collections:update` intentionally remain in the role
 * lists: the catalog aliases them to `collections:write`, which is the gate the
 * collection endpoints actually require.
 */
export const DEFAULT_ROLE_GRANTS = {
  developer: [
    "system:dashboard",
    "api:graphql",
    "api:collections",
    "api:export",
    "api:systemInfo",
    "api:user",
    "api:userActivity",
    "api:media",
    // Granular media capabilities: the `/api/media` and
    // `/api/system-virtual-folder` dispatcher gates require these, not the
    // coarse `api:media` name. Without them the media gallery silently 403s
    // (folder tree, folder create, image editor save).
    "media:read",
    "media:write",
    "media:delete",
    "api:widgets",
    "api:send-mail",
    "collections:read",
    "collections:update",
    "collections:create",
    "content:builder",
    "config:collectionbuilder",
    "config:widgetManagement",
    "config:adminArea",
    "config:settings",
    "user:manage",
    "user.create",
    // AI surface (/api/ai, /api/chat): editors use translation, enrichment
    // and scoring; the builder stays admin-gated separately.
    "ai:use",
  ],
  editor: [
    "collections:read",
    "collections:read_drafts",
    "collections:update",
    "collections:create",
    "content:editor",
    "content:read_drafts",
    "content:images",
    "system:dashboard",
    "api:systemInfo",
    "api:collections",
    "api:user",
    "api:userActivity",
    "api:media",
    "media:read",
    "media:write",
    "media:delete",
    "user:manage",
    "ai:use",
  ],
  guest: [
    "collections:read",
    "api:collections",
    "api:media",
    "media:read",
    "graphql:read",
    "api:graphql",
  ],
} as const satisfies Record<string, readonly string[]>;
