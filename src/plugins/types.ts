/**
 * @file src/plugins/types.ts
 * @description Type definitions for the SveltyCMS plugin system
 */

import type { User } from "@auth/types";
import type { BaseEntity, Schema } from "@content/types";
import type {
  DatabaseId,
  DatabaseResult,
  IDBAdapter,
  ISODateString,
} from "@databases/db-interface";

/** All possible capabilities a plugin can request */
export type PluginCapability =
  | "db:read" // Read database collections
  | "db:write" // Write to database collections
  | "db:delete" // Delete from database collections
  | "network:fetch" // Make outbound HTTP requests
  | "network:webhook" // Register webhook endpoints
  | "file:read" // Read files from storage
  | "file:write" // Write files to storage
  | "media:read" // Access media library
  | "media:write" // Upload/modify media
  | "media:delete" // Delete media
  | "user:read" // Read user data
  | "user:write" // Create/update users
  | "settings:read" // Read system settings
  | "settings:write" // Modify system settings
  | "ui:slot" // Inject UI into slot zones
  | "ui:page" // Register custom admin pages
  | "event:subscribe" // Subscribe to system events
  | "event:publish"; // Publish system events

/**
 * Plugin metadata and registration info
 */
export interface PluginMetadata {
  /** Plugin author */
  author?: string;

  /** Declared capabilities — enforced at runtime by the RBAC dispatcher */
  capabilities?: PluginCapability[];

  /** Short description of plugin functionality */
  description: string;

  /** Whether plugin is currently enabled globally */
  enabled: boolean;

  /** Plugin icon (Iconify string) */
  icon?: string;
  /** Unique plugin identifier (e.g., 'pagespeed', 'seo-audit') */
  id: string;

  /** Human-readable plugin name */
  name: string;

  /** Plugin category (e.g., 'performance', 'editing') */
  category?: string;

  /** Plugin version (semver) */
  version: string;
}

/**
 * Plugin migration definition
 * Plugins use migrations to manage their database tables/collections
 */
export interface PluginMigration {
  /** Description of what this migration does */
  description: string;

  /** Rollback function (optional, for future use) */
  down?: (dbAdapter: IDBAdapter) => Promise<void>;
  /** Unique migration identifier (e.g., '001_create_results_table') */
  id: string;

  /** Plugin ID this migration belongs to */
  pluginId: string;

  /** Migration execution function */
  up: (dbAdapter: IDBAdapter) => Promise<void>;

  /** Migration version (for ordering) */
  version: number;
}

/**
 * Plugin configuration schema
 * Defines both public and private settings for a plugin
 */
export interface PluginConfig {
  /** Private settings (server-only, e.g., API keys) */
  private?: Record<string, unknown>;
  /** Public settings (visible to client) */
  public?: Record<string, unknown>;
}

/**
 * Context passed to plugin hooks
 * Contains all information needed for language-aware, multi-tenant operations
 */
export interface PluginContext {
  /** Collection schema being viewed */
  collectionSchema: Schema;

  /** Database adapter for plugin operations */
  dbAdapter: IDBAdapter;

  /** Content language from route params */
  language: string;

  /** Tenant ID (or 'default' when MULTI_TENANT disabled) */
  tenantId: string;
  /** Current user making the request */
  user: User;

  /** System settings for the current tenant */
  settings?: Record<string, any>;

  /** Configuration for the specific plugin */
  pluginConfig?: Record<string, any>;
}

/**
 * Entry data enrichment result from plugins
 * Plugins return additional data to display in EntryList columns
 */
export interface PluginEntryData {
  /** Plugin-specific data (structure determined by plugin) */
  data: Record<string, unknown>;
  /** Entry ID this data belongs to */
  entryId: string;

  /** When this data was last updated */
  updatedAt: ISODateString;
}

/**
 * SSR hook for enriching entry list data
 * Called during +page.server.ts load to add plugin data to entries
 */
export type PluginSSRHook = (
  context: PluginContext,
  entries: Record<string, unknown>[],
) => Promise<PluginEntryData[]>;

// UI column definition for plugin data display
export interface PluginColumn {
  /** Svelte component to render cell content */
  component?: string;
  /** Column identifier */
  id: string;

  /** Column header label (localization key or static text) */
  label: string;

  /** Props to pass to the component (keys map to entry properties) */
  props?: Record<string, string>;

  /** Whether column is sortable */
  sortable?: boolean;

  /** Column width (CSS value) */
  width?: string;
}

/**
 * Plugin UI contribution
 * Defines how plugin data appears in EntryList
 */
export interface PluginUIContribution {
  /** Actions/buttons to add per entry */
  actions?: Array<{
    id: string;
    label: string;
    icon?: string;
    handler: string; // Name of the client-side action handler
    confirm?: string; // Optional confirmation message
  }>;
  /** Additional columns to display */
  columns?: PluginColumn[];

  /** Custom tabs/panels for the Edit Entry view */
  editView?: {
    tabs?: Array<{
      id: string;
      label: string;
      icon: string;
      component: any; // Svelte component or loader path
    }>;
    sidebar?: any[]; // Svelte components
  };

  /** UI slots for injection zones (config, dashboard, sidebar, plugin_workspace, etc.) */
  slots?: PluginSlot[];
}

/** Server handlers exported by a plugin workspace slot module */
export interface PluginServerModule {
  actions?: Record<
    string,
    (event: {
      request: Request;
      locals: Record<string, unknown>;
      params: Record<string, string>;
    }) => Promise<Record<string, unknown>>
  >;
}

// Injection Zones for Slot System
// Any plugin can target these zones to inject UI into CMS routes
export type InjectionZone =
  | "dashboard" // Dashboard widgets
  | "sidebar" // Global sidebar
  | "entry_edit" // Content entry editor
  | "entry_edit_sidebar" // Entry editor sidebar
  | "entry_edit_header" // Entry editor header
  | "config" // System configuration page
  | "config_grid" // Config page icon grid (additional tiles)
  | "plugin_workspace" // Fullscreen plugin GUI overlay (slot-driven, no routes)
  | "collection_builder" // Collection builder page
  | "media_gallery" // Media gallery page
  | "media_gallery_toolbar" // Media gallery toolbar
  | "user_profile" // User profile/settings page
  | "user_profile_sidebar" // User profile sidebar
  | "entry_list_actions" // Entry list action buttons
  | "global-toolbar" // Top-level toolbar (all routes)
  | "global-footer" // Footer (all routes)
  | "sticky-action-bar" // Sticky action bar at bottom
  | "image_editor_tool"; // Image editor tool/widgets

// Plugin Slot definition
export interface PluginSlot {
  component: () => Promise<any>; // Lazy loaded Svelte component
  condition?: (context: any) => boolean; // Optional condition to show/hide slot
  id: string;
  /** Owning plugin id (set automatically during registration) */
  pluginId?: string;
  permissions?: string[]; // RBAC roles
  position?: number;
  props?: Record<string, any>;
  /** Server module for `/api/plugins/[pluginId]` action delegation */
  server?: () => Promise<PluginServerModule>;
  zone: InjectionZone;
}

// Lifecycle hooks for plugins to intercept CRUD operations
export interface PluginLifecycleHooks {
  afterDelete?: (context: PluginContext, collection: string, id: string) => Promise<void>;
  afterSave?: (context: PluginContext, collection: string, result: any) => Promise<void>;
  beforeDelete?: (context: PluginContext, collection: string, id: string) => Promise<void>;
  beforeSave?: (context: PluginContext, collection: string, data: any) => Promise<any>;
}

/**
 * Complete plugin definition
 * Registered plugins must implement this interface
 */
export interface Plugin {
  /** Plugin configuration schema */
  config?: PluginConfig;

  /** Which collections this plugin is enabled for (empty = all) */
  enabledCollections?: string[]; // Collection IDs

  /** Lifecycle hooks (CRUD interception) */
  hooks?: PluginLifecycleHooks;
  /** Plugin metadata */
  metadata: PluginMetadata;

  /** Plugin migrations (executed in version order) */
  migrations?: PluginMigration[];

  /** SSR hook for data enrichment (optional) */
  ssrHook?: PluginSSRHook;

  /** UI contributions (optional) */
  ui?: PluginUIContribution;
}

/**
 * Plugin registry storage format
 * Tracks which plugins are registered and their state
 */
export interface PluginRegistryEntry {
  lastMigration?: string; // ID of last executed migration
  plugin: Plugin;
  registeredAt: ISODateString;
}

/**
 * Migration tracking record
 * Stored in plugin_migrations collection to track applied migrations
 */
export interface PluginMigrationRecord extends BaseEntity {
  _id: DatabaseId;
  appliedAt: Date;
  createdAt: ISODateString;
  migrationId: string;
  pluginId: string;
  tenantId?: DatabaseId | null;
  updatedAt: ISODateString;
  version: number;
}

/**
 * Plugin state record
 * Stored in plugin_states collection
 */
export interface PluginState extends BaseEntity {
  _id: DatabaseId;
  createdAt: ISODateString;
  enabled: boolean;
  pluginId: string;
  settings?: Record<string, any>;
  tenantId?: DatabaseId | null;
  updatedAt: ISODateString;
  updatedBy?: string;
}

/**
 * Plugin service interface
 * Main API for interacting with the plugin system
 */
export interface IPluginService {
  /** Get a specific plugin by ID */
  get(pluginId: string): Plugin | undefined;

  /** Get all registered plugins */
  getAll(): Plugin[];

  /** Get Lifecycle hooks for enabled plugins on a collection */
  getLifecycleHooks<K extends keyof PluginLifecycleHooks>(
    collectionId: string,
    hookName: K,
    tenantId?: string | null,
  ): Promise<Exclude<PluginLifecycleHooks[K], undefined>[]>;

  /** Get SSR hooks for enabled plugins on a collection */
  getSSRHooks(collectionId: string, tenantId?: string | null): Promise<PluginSSRHook[]>;

  /** Check if a plugin is enabled for a collection */
  isEnabledForCollection(
    pluginId: string,
    collectionId: string,
    tenantId?: string | null,
  ): Promise<boolean>;
  /** Register a new plugin */
  register(plugin: Plugin): Promise<DatabaseResult<void>>;

  /** Run all pending migrations for all plugins */
  runAllMigrations(dbAdapter: IDBAdapter, tenantId: string): Promise<DatabaseResult<void>>;

  /** Run pending migrations for a plugin */
  runMigrations(
    pluginId: string,
    dbAdapter: IDBAdapter,
    tenantId: string,
  ): Promise<DatabaseResult<void>>;

  /** Toggle plugin enabled state */
  togglePlugin(
    pluginId: string,
    enabled: boolean,
    tenantId: string,
    userId?: string,
  ): Promise<boolean>;
}
