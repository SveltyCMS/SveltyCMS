/**
 * @file src/utils/command-palette-catalog.ts
 * @description Static admin catalog for the global command palette.
 *
 * ### Features:
 * - Pure data table — intentionally dependency-free (no imports)
 * - Paraglide message keys for title/description plus English fallbacks
 * - Multi-trigger entries (one catalog row → several navigable destinations)
 * - Route-prefix context boosts and display weights
 *
 * The palette logic in `command-palette.ts` imports this table and re-exports
 * it, so consumers keep importing `STATIC_CATALOG` from the same module.
 */

export interface StaticCatalogTrigger {
  path: string;
  actionImport?: string;
  action?: (() => void | Promise<void>)[];
}

export interface StaticCatalogDef {
  id: string;
  category: "page" | "action" | "collection" | "entry" | "media" | "user" | "plugin" | "recent";
  titleKey: string;
  descriptionKey: string;
  /** English fallback if Paraglide not compiled yet */
  titleFallback: string;
  descriptionFallback: string;
  keywords: string[];
  icon: string;
  path: string;
  triggers?: Record<string, StaticCatalogTrigger>;
  contextBoost?: string[];
  weight?: number;
}

export const STATIC_CATALOG: StaticCatalogDef[] = [
  {
    id: "page:dashboard",
    category: "page",
    titleKey: "global_search_dashboard_title",
    descriptionKey: "global_search_dashboard_description",
    titleFallback: "Dashboard",
    descriptionFallback: "System overview, activity, and real-time health metrics.",
    keywords: ["home", "dashboard", "activity", "health", "metrics"],
    icon: "mdi:view-dashboard",
    path: "/dashboard",
    contextBoost: ["/dashboard"],
    weight: 20,
    triggers: { "Go to Dashboard": { path: "/dashboard" } },
  },
  {
    id: "page:media",
    category: "page",
    titleKey: "global_search_media_title",
    descriptionKey: "global_search_media_description",
    titleFallback: "Media Gallery",
    descriptionFallback: "DAM engine with tagging, batch editing, and transcoding.",
    keywords: ["media", "gallery", "images", "batch", "transcode", "video", "audio", "dam"],
    icon: "mdi:image-multiple",
    path: "/mediagallery",
    contextBoost: ["/mediagallery"],
    weight: 18,
    triggers: {
      "Go to Media Gallery": { path: "/mediagallery" },
      "Batch Image Processor": { path: "/mediagallery?mode=batch" },
      "Video Transcoding Hub": { path: "/mediagallery?mode=transcode" },
    },
  },
  {
    id: "page:collectionbuilder",
    category: "page",
    titleKey: "global_search_builder_title",
    descriptionKey: "global_search_builder_description",
    titleFallback: "Collection Builder",
    descriptionFallback: "Build schemas with visual logic and field validation.",
    keywords: ["builder", "collection", "schema", "logic", "field", "validation"],
    icon: "mdi:database-edit",
    path: "/config/collectionbuilder",
    contextBoost: ["/config/collectionbuilder"],
    weight: 18,
    triggers: {
      "Go to Collection Builder": { path: "/config/collectionbuilder" },
      "Create New Collection": { path: "/config/collectionbuilder/new" },
    },
  },
  {
    id: "action:create-collection",
    category: "action",
    titleKey: "global_search_create_collection_title",
    descriptionKey: "global_search_create_collection_description",
    titleFallback: "Create collection",
    descriptionFallback: "Open Collection Builder with a new schema.",
    keywords: ["create", "new", "collection", "schema"],
    icon: "mdi:plus-box",
    path: "/config/collectionbuilder/new",
    contextBoost: ["/config/collectionbuilder"],
    weight: 16,
  },
  {
    id: "page:settings",
    category: "page",
    titleKey: "global_search_settings_title",
    descriptionKey: "global_search_settings_description",
    titleFallback: "System Settings",
    descriptionFallback: "Database, email, cache, and security configuration.",
    keywords: ["settings", "config", "smtp", "email", "cache", "security", "database"],
    icon: "mdi:cog",
    path: "/config/system-settings",
    contextBoost: ["/config/system-settings", "/config"],
    weight: 15,
  },
  {
    id: "page:monitor",
    category: "page",
    titleKey: "global_search_monitor_title",
    descriptionKey: "global_search_monitor_description",
    titleFallback: "System Monitor",
    descriptionFallback: "Health dashboard, audit log, and plugin status.",
    keywords: ["monitor", "health", "audit", "status", "logs", "cpu", "memory"],
    icon: "mdi:heart-pulse",
    path: "/config/monitor",
    contextBoost: ["/config/monitor"],
    weight: 12,
  },
  {
    id: "page:access",
    category: "page",
    titleKey: "global_search_access_title",
    descriptionKey: "global_search_access_description",
    titleFallback: "Access Management",
    descriptionFallback: "Users, roles, permissions, tokens, and SAML/SCIM.",
    keywords: ["access", "users", "roles", "permissions", "tokens", "rbac", "saml", "scim"],
    icon: "mdi:shield-account",
    path: "/config/access-management",
    contextBoost: ["/config/access-management"],
    weight: 14,
  },
  {
    id: "page:tenants",
    category: "page",
    titleKey: "global_search_tenants_title",
    descriptionKey: "global_search_tenants_description",
    titleFallback: "Tenants",
    descriptionFallback: "Manage organizations, resource quotas, and tenant isolation.",
    keywords: ["tenant", "tenants", "organizations", "quota", "isolation", "multi-tenant"],
    icon: "mdi:office-building",
    path: "/config/tenants",
    contextBoost: ["/config/tenants", "/config", "/admin"],
    weight: 15,
  },
  {
    id: "page:extensions",
    category: "page",
    titleKey: "global_search_extensions_title",
    descriptionKey: "global_search_extensions_description",
    titleFallback: "Extensions",
    descriptionFallback: "Plugins, widgets, themes, and marketplace discovery.",
    keywords: ["extensions", "plugins", "widgets", "themes", "marketplace", "install"],
    icon: "mdi:puzzle",
    path: "/config/extensions",
    contextBoost: ["/config/extensions"],
    weight: 12,
  },
  {
    id: "page:automations",
    category: "page",
    titleKey: "global_search_automations_title",
    descriptionKey: "global_search_automations_description",
    titleFallback: "Automations",
    descriptionFallback: "Event-driven workflows with conditional logic.",
    keywords: ["automation", "workflow", "trigger", "action", "event", "rule"],
    icon: "mdi:robot",
    path: "/config/automations",
    contextBoost: ["/config/automations"],
    weight: 12,
  },
  {
    id: "page:queue",
    category: "page",
    titleKey: "global_search_queue_title",
    descriptionKey: "global_search_queue_description",
    titleFallback: "Background Queue",
    descriptionFallback: "Jobs, scheduled tasks, and failed operation retries.",
    keywords: ["queue", "jobs", "tasks", "background", "retry", "scheduled"],
    icon: "mdi:tray-full",
    path: "/config/queue",
    contextBoost: ["/config/queue"],
    weight: 10,
  },
  {
    id: "page:sync",
    category: "page",
    titleKey: "global_search_sync_title",
    descriptionKey: "global_search_sync_description",
    titleFallback: "Data Sync & Import",
    descriptionFallback: "Import from WordPress, Strapi, Directus, Drupal, or exports.",
    keywords: ["sync", "import", "export", "migrate", "wordpress", "strapi", "directus", "drupal"],
    icon: "mdi:swap-horizontal",
    path: "/config/sync",
    contextBoost: ["/config/sync"],
    weight: 10,
  },
  {
    id: "page:webhooks",
    category: "page",
    titleKey: "global_search_webhooks_title",
    descriptionKey: "global_search_webhooks_description",
    titleFallback: "Webhooks",
    descriptionFallback: "Outgoing HTTP callbacks on content events.",
    keywords: ["webhook", "callback", "http", "event", "integration", "dlq"],
    icon: "mdi:webhook",
    path: "/config/webhooks",
    contextBoost: ["/config/webhooks"],
    weight: 10,
  },
  {
    id: "page:redirects",
    category: "page",
    titleKey: "global_search_redirects_title",
    descriptionKey: "global_search_redirects_description",
    titleFallback: "Redirects",
    descriptionFallback: "301/302 rules with regex patterns and CSV import.",
    keywords: ["redirect", "seo", "301", "302", "regex", "url", "rewrite"],
    icon: "mdi:directions-fork",
    path: "/config/redirects",
    contextBoost: ["/config/redirects"],
    weight: 8,
  },
  {
    id: "page:trash",
    category: "page",
    titleKey: "global_search_trash_title",
    descriptionKey: "global_search_trash_description",
    titleFallback: "Trash",
    descriptionFallback: "Recover or permanently delete soft-deleted content.",
    keywords: ["trash", "delete", "recover", "restore", "soft-delete", "undo"],
    icon: "mdi:delete-restore",
    path: "/config/trash",
    contextBoost: ["/config/trash"],
    weight: 8,
  },
  {
    id: "page:user",
    category: "page",
    titleKey: "global_search_profile_title",
    descriptionKey: "global_search_profile_description",
    titleFallback: "User Profile",
    descriptionFallback: "Account settings, avatar, password, 2FA, and sessions.",
    keywords: ["user", "profile", "avatar", "password", "2fa", "session", "account"],
    icon: "mdi:account-circle",
    path: "/user",
    contextBoost: ["/user"],
    weight: 12,
  },
  {
    id: "page:config",
    category: "page",
    titleKey: "global_search_config_title",
    descriptionKey: "global_search_config_description",
    titleFallback: "System Configuration",
    descriptionFallback: "System configuration overview and navigation hub.",
    keywords: ["config", "settings", "setup", "administration", "system"],
    icon: "mdi:tune",
    path: "/config",
    contextBoost: ["/config"],
    weight: 10,
  },
  {
    id: "action:invite-user",
    category: "action",
    titleKey: "global_search_invite_user_title",
    descriptionKey: "global_search_invite_user_description",
    titleFallback: "Invite user",
    descriptionFallback: "Open user management to send an invite token.",
    keywords: ["invite", "user", "token", "register"],
    icon: "mdi:account-plus",
    path: "/user",
    contextBoost: ["/user", "/config/access-management"],
    weight: 11,
  },
];
