/**
 * @file src/services/system/settings-groups.meta.ts
 * @description Browser-safe metadata for the System Settings navigator.
 *
 * The exhaustive setting catalog — field descriptors (options, defaults,
 * validation limits) and the server key/category contract — lives in
 * `settings-groups.server.ts`; only the active group's descriptors reach the
 * page as load data. This module keeps what the sidebar needs on every admin
 * page: ids, labels, icons, descriptions and each field's key + label.
 *
 * ### Features:
 * - `SettingGroup` / `SettingField` types shared by the server catalog and forms
 * - Static group summaries for the sidebar navigator and its field search
 * - Role filter for `adminOnly` groups (pure metadata)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SettingField {
  category: "private" | "public";
  description: string;
  key: string;
  label: string;
  max?: number;
  /**
   * Declarative max length for text fields. Serializable, unlike `validation`,
   * because the catalog is delivered to the page as load data.
   */
  maxLength?: number;
  min?: number;
  options?: Array<{ value: string | number; label: string }>;
  placeholder?: string;
  readonly?: boolean;
  required?: boolean;
  sensitive?: boolean;
  rows?: number;
  type:
    | "text"
    | "number"
    | "boolean"
    | "security"
    | "select"
    | "array"
    | "language-multi"
    | "language-select"
    | "loglevel-multi"
    | "textarea";
  unit?: string;
  validation?: (value: unknown) => string | null;
}

export interface SettingGroup {
  adminOnly?: boolean;
  description: string;
  enabled: boolean;
  fields: SettingField[];
  icon: string;
  id: string;
  name: string;
  permissionId?: string;
  requiresRestart?: boolean;
}

/** Minimal field descriptor the sidebar searches (key + label). */
export interface SettingFieldSummary {
  key: string;
  label: string;
}

/** Group display metadata without the render-time field catalog. */
export interface SettingGroupSummary {
  adminOnly?: boolean;
  description: string;
  enabled: boolean;
  fields: SettingFieldSummary[];
  icon: string;
  id: string;
  name: string;
  permissionId?: string;
  requiresRestart?: boolean;
}

// ─── Sidebar catalog ────────────────────────────────────────────────────────

/**
 * Sidebar navigation metadata. Kept in sync with `settingsGroups` by
 * `tests/unit/config/settings-groups.test.ts` (ids, labels, icons, keys).
 */
export const SETTINGS_GROUP_SUMMARIES: readonly SettingGroupSummary[] = [
  {
    id: "licensing",
    name: "Licensing & Compliance",
    icon: "⚖️",
    description: "Manage commercial licensing (BSL 1.1) and usage data settings",
    enabled: true,
    requiresRestart: false,
    adminOnly: true,
    permissionId: "config:settings:licensing",
    fields: [
      { key: "LICENSE_KEY", label: "Enterprise License Key" },
      { key: "SVELTY_TELEMETRY_DISABLED", label: "Disable Telemetry" },
      { key: "DO_NOT_TRACK", label: "Do Not Track (Strict)" },
    ],
  },
  {
    id: "cache",
    name: "Cache & Performance",
    icon: "⚡",
    description: "Configure cache TTLs and performance optimization settings",
    enabled: true,
    requiresRestart: false,
    adminOnly: true,
    permissionId: "config:settings:cache",
    fields: [
      { key: "CACHE_TTL_SCHEMA", label: "Schema Cache TTL" },
      { key: "CACHE_TTL_WIDGET", label: "Widget Cache TTL" },
      { key: "CACHE_TTL_THEME", label: "Theme Cache TTL" },
      { key: "CACHE_TTL_CONTENT", label: "Content Cache TTL" },
      { key: "CACHE_TTL_MEDIA", label: "Media Cache TTL" },
      { key: "CACHE_TTL_SESSION", label: "Session Cache TTL" },
      { key: "CACHE_TTL_USER", label: "User Cache TTL" },
      { key: "CACHE_TTL_API", label: "API Cache TTL" },
    ],
  },
  {
    id: "database",
    name: "Database",
    icon: "🗄️",
    description: "Database connection and configuration settings (managed in config/private.ts)",
    enabled: false,
    requiresRestart: true,
    adminOnly: true,
    permissionId: "config:settings:database",
    fields: [
      { key: "DB_TYPE", label: "Database Type" },
      { key: "DB_HOST", label: "Database Host" },
      { key: "DB_PORT", label: "Database Port" },
      { key: "DB_NAME", label: "Database Name" },
      { key: "DB_USER", label: "Database Username" },
      { key: "DB_PASSWORD", label: "Database Password" },
      { key: "DB_RETRY_ATTEMPTS", label: "Retry Attempts" },
      { key: "DB_RETRY_DELAY", label: "Retry Delay" },
      { key: "DB_POOL_SIZE", label: "Connection Pool Size" },
    ],
  },
  {
    id: "scaling",
    name: "Enterprise Scaling & CDN",
    icon: "🌐",
    description: "Configure global edge nodes and CDN synchronization (Cloudflare)",
    enabled: true,
    requiresRestart: false,
    adminOnly: true,
    permissionId: "config:settings:scaling",
    fields: [
      { key: "DB_REPLICA_URLS", label: "Database Read Replicas" },
      { key: "CF_API_TOKEN", label: "Cloudflare API Token" },
      { key: "CF_ZONE_ID", label: "Cloudflare Zone ID" },
      { key: "CF_PURGE_MODE", label: "CDN Purge Strategy" },
      { key: "DEMO_TTL", label: "Demo Session TTL" },
    ],
  },
  {
    id: "redis",
    name: "Redis Cache",
    icon: "💾",
    description:
      "Redis server configuration and cache settings (optional - no defaults, configure only if using Redis)",
    enabled: true,
    requiresRestart: true,
    adminOnly: true,
    permissionId: "config:settings:redis",
    fields: [
      { key: "USE_REDIS", label: "Enable Redis" },
      { key: "REDIS_HOST", label: "Redis Host" },
      { key: "REDIS_PORT", label: "Redis Port" },
      { key: "REDIS_PASSWORD", label: "Redis Password" },
    ],
  },
  {
    id: "email",
    name: "Email / SMTP",
    icon: "📧",
    description: "Email server and SMTP configuration",
    enabled: true,
    requiresRestart: false,
    adminOnly: true,
    permissionId: "config:settings:email",
    fields: [
      { key: "SMTP_HOST", label: "SMTP Host" },
      { key: "SMTP_PORT", label: "SMTP Port" },
      { key: "SMTP_USER", label: "SMTP Username" },
      { key: "SMTP_PASS", label: "SMTP Password" },
      { key: "SMTP_MAIL_FROM", label: "From Address" },
      { key: "SMTP_EMAIL", label: "Reply-To Address" },
    ],
  },
  {
    id: "security",
    name: "Security",
    icon: "🔒",
    description: "Security settings including JWT, encryption, and authentication",
    enabled: true,
    requiresRestart: true,
    adminOnly: true,
    permissionId: "config:settings:security",
    fields: [
      { key: "JWT_SECRET_KEY", label: "JWT Secret Key" },
      { key: "ENCRYPTION_KEY", label: "Encryption Key" },
      { key: "PASSWORD_MIN_LENGTH", label: "Minimum Password Length" },
      { key: "RATE_LIMIT_SECRET", label: "Rate Limit Secret" },
      { key: "SESSION_DEVICE_POLICY", label: "Session Device Policy" },
      { key: "SESSION_TTL_HOURS", label: "Session Lifetime (hours)" },
      { key: "SESSION_IDLE_HOURS", label: "Session Idle Timeout (hours)" },
      { key: "SESSION_MAX_PER_USER", label: "Max Sessions Per User" },
    ],
  },
  {
    id: "saml",
    name: "SAML / Enterprise SSO",
    icon: "🏢",
    description: "SAML 2.0 identity provider keys for enterprise single sign-on",
    enabled: true,
    requiresRestart: true,
    adminOnly: true,
    permissionId: "config:settings:saml",
    fields: [
      { key: "SAML_CLIENT_SECRET_VERIFIER", label: "Client Secret Verifier" },
      { key: "SAML_ENCRYPTION_KEY", label: "Encryption Key" },
      { key: "SAML_JWT_SIGNING_PRIVATE_KEY", label: "JWT Signing Private Key" },
      { key: "SAML_JWT_SIGNING_PUBLIC_KEY", label: "JWT Signing Public Key" },
    ],
  },
  {
    id: "oauth",
    name: "OAuth & Social Login",
    icon: "🔐",
    description:
      "Third-party authentication providers (optional - no defaults, configure only if using OAuth)",
    enabled: true,
    requiresRestart: false,
    adminOnly: true,
    permissionId: "config:settings:oauth",
    fields: [
      { key: "USE_GOOGLE_OAUTH", label: "Enable Google OAuth" },
      { key: "GOOGLE_CLIENT_ID", label: "Google Client ID" },
      { key: "GOOGLE_CLIENT_SECRET", label: "Google Client Secret" },
      { key: "GOOGLE_API_KEY", label: "Google API Key" },
      { key: "GOOGLE_MAPS_API_KEY", label: "Google Maps API Key" },
    ],
  },
  {
    id: "media",
    name: "Media Storage",
    icon: "🖼️",
    description: "Media storage, processing, and upload configuration",
    enabled: true,
    requiresRestart: false,
    adminOnly: true,
    permissionId: "config:settings:media",
    fields: [
      { key: "MEDIA_STORAGE_TYPE", label: "Media Storage Type" },
      { key: "MEDIA_FOLDER", label: "Media Folder Path" },
      { key: "MEDIASERVER_URL", label: "Media Server URL" },
      { key: "MAX_FILE_SIZE", label: "Max File Size" },
      { key: "BODY_SIZE_LIMIT", label: "Body Size Limit" },
      { key: "USE_ARCHIVE_ON_DELETE", label: "Archive on Delete" },
    ],
  },
  {
    id: "languages",
    name: "Languages & Localization",
    icon: "🌐",
    description:
      "Admin UI system language (EN/DE shipped) and content languages. Extra system locales write project.inlang/settings.json and run machine translate.",
    enabled: true,
    requiresRestart: false,
    adminOnly: false,
    permissionId: "config:settings:languages",
    fields: [
      { key: "DEFAULT_CONTENT_LANGUAGE", label: "Default Content Language" },
      { key: "AVAILABLE_CONTENT_LANGUAGES", label: "Available Content Languages" },
      { key: "BASE_LOCALE", label: "Default System Language" },
      { key: "LOCALES", label: "System Languages" },
    ],
  },
  {
    id: "integrations",
    name: "Third-Party Integrations",
    icon: "🧩",
    description: "External service integrations and API tokens",
    enabled: true,
    requiresRestart: false,
    adminOnly: true,
    permissionId: "config:settings:integrations",
    fields: [
      { key: "TWITCH_CLIENT_ID", label: "Twitch Client ID" },
      { key: "TWITCH_TOKEN", label: "Twitch Access Token" },
      { key: "TIKTOK_TOKEN", label: "TikTok API Token" },
    ],
  },
  {
    id: "site",
    name: "Site Configuration",
    icon: "🌍",
    description: "General site settings and configuration",
    enabled: true,
    requiresRestart: false,
    adminOnly: false,
    permissionId: "config:settings:site",
    fields: [
      { key: "SITE_NAME", label: "Site Name" },
      { key: "SITE_SLOGAN", label: "Site Slogan" },
      { key: "TIMEZONE", label: "System Timezone" },
      { key: "HOST_DEV", label: "Development URL" },
      { key: "HOST_PROD", label: "Production URL" },
      { key: "PREVIEW_BASE_URL", label: "Preview Base URL" },
      { key: "EXTRACT_DATA_PATH", label: "Data Export Path" },
    ],
  },
  {
    id: "appearance",
    name: "Seasonal Effects",
    icon: "🎨",
    description: "Seasonal login decorations. Admin themes live in Design System.",
    enabled: true,
    requiresRestart: false,
    adminOnly: false,
    permissionId: "config:settings:appearance",
    fields: [
      { key: "SEASONS", label: "Enable Seasonal Themes" },
      { key: "SEASON_REGION", label: "Season Region" },
    ],
  },
  {
    id: "logging",
    name: "Logging & Monitoring",
    icon: "📊",
    description: "Application logging and monitoring configuration",
    enabled: true,
    requiresRestart: false,
    adminOnly: true,
    permissionId: "config:settings:logging",
    fields: [
      { key: "LOG_LEVELS", label: "Log Levels" },
      { key: "LOG_RETENTION_DAYS", label: "Log Retention Days" },
      { key: "LOG_ROTATION_SIZE", label: "Log Rotation Size" },
    ],
  },
  {
    id: "gdpr",
    name: "Privacy & GDPR",
    icon: "🛡️",
    description: "Manage GDPR compliance, data exports, and right to erasure.",
    enabled: true,
    requiresRestart: false,
    adminOnly: true,
    permissionId: "config:settings:gdpr",
    fields: [], // Custom UI handled in +page.svelte
  },
];

/**
 * Get the enabled settings-group summaries a role may see.
 */
export function getSettingGroupSummariesByRole(isAdmin: boolean): SettingGroupSummary[] {
  return SETTINGS_GROUP_SUMMARIES.filter((group) => group.enabled && (!group.adminOnly || isAdmin));
}
