/**
 * @file src/content/types.ts
 * @description Application-level TypeScript interfaces for content modeling and runtime data
 *
 * Features:
 * - Schema/Field/Widget definitions
 * - base entity metadata
 * - revision tracking
 * - unified content node
 * - dashboard configurations
 */

import type { WidgetRecord as widgets } from "@src/widgets/types";
// Note: collectionSchemas may be used in the future for runtime validation

// Auth
import type { RolePermissions } from "@src/databases/auth/types";
import type { WidgetPlaceholder } from "@src/widgets/placeholder";
import type { ContentTypes, CollectionMap } from "./types.generated";

export type { ContentTypes, CollectionMap };

// Define core value and status types
export type FieldValue = string | number | boolean | object | null;
// Status types for collections and entries
export const StatusTypes = {
  archive: "archive",
  draft: "draft",
  publish: "publish",
  unpublish: "unpublish",
  schedule: "schedule",
  clone: "clone",
  delete: "delete",
} as const;

export type StatusType = (typeof StatusTypes)[keyof typeof StatusTypes];

// --- Strongly-Typed Identifiers ---
export type DatabaseId = string & { readonly __brand: "DatabaseId" };
export type ISODateString = string & { readonly __isoDate: "ISODateString" };

export interface BaseEntity {
  _id: DatabaseId;
  createdAt: ISODateString;
  deletedAt?: ISODateString; // Timestamp of deletion
  deletedBy?: string; // User who performed deletion
  isDeleted?: boolean; // Soft delete flag
  tenantId?: DatabaseId | null; // For multi-tenant support
  updatedAt: ISODateString;
}

// Collection Entry - A data record in a collection with common metadata
export interface CollectionEntry extends Record<string, unknown> {
  _id?: string;
  createdAt?: string;
  createdBy?: string;
  status?: StatusType;
  tenantId?: DatabaseId | null;
  updatedAt?: string;
  updatedBy?: string;
}

// Revision Data - A historical snapshot of a collection entry
export interface RevisionData {
  _id: string;
  collectionId: string;
  data: Record<string, unknown>;
  entryId: string;
  operation?: "create" | "update" | "delete" | "status_change";
  tenantId?: DatabaseId | null;
  timestamp: ISODateString;
  userId?: string;
  // Fix: removed index signature to prevent swallowing typos
}

export interface Translation {
  isDefault?: boolean;
  languageTag: string;
  translationName: string;
}

// --- Unified Content Node ---
// A single interface to represent both categories and collections in the content tree.
// Fix: ContentNode now extends BaseEntity to avoid duplication
export interface ContentNode extends BaseEntity {
  children?: ContentNode[];
  collectionDef?: Schema; // Only present if nodeType is 'collection'
  description?: string;
  icon?: string;
  name: string;
  nodeType: "category" | "collection";
  order: number;
  position?: number;
  parentId?: DatabaseId;
  path?: string;
  slug?: string;
  source?: "filesystem" | "database";
  translations: Translation[];
}

// --- Website Token ---
// Represents an API token for headless website access.
export interface WebsiteToken extends BaseEntity {
  createdBy: string;
  expiresAt?: ISODateString;
  name: string;
  permissions?: string[];
  token: string;
  type?: "content-api" | "admin-api";
}

// Widget field type definition
export type WidgetKeys = keyof widgets;
export type WidgetTypes = widgets[WidgetKeys];

// Widget Definition is now imported from @widgets/types
import type { WidgetDefinition } from "@widgets/types";

export interface EntryListProps {
  contentLanguage?: string;
  entries?: CollectionEntry[];
  pagination?: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    pagesCount: number;
  };
}

export interface FieldsProps {
  contentLanguage?: string;
  fields: FieldInstance[];
  revisions?: RevisionData[];
}

export interface WidgetLoaderProps {
  field: FieldInstance;
  loader: () => Promise<{ default: unknown }>;
  tenantId?: DatabaseId | null;
  value?: unknown;
  WidgetData?: Record<string, unknown>;
}

export interface EntryListMultiButtonProps {
  clone: () => void;
  create: () => void;
  delete: (permanent: boolean) => void;
  hasSelections?: boolean;
  isCollectionEmpty?: boolean;
  publish: () => void;
  schedule: (date: string, action: string) => void;
  selectedCount?: number;
  showDeleted?: boolean;
  test: () => void;
  unpublish: () => void;
}

/**
 * AUTH tab: permission and access control for a single field.
 * Stored in field.permissions. Defaults: public, no auth required, no role restrictions.
 */
export interface WidgetFieldPermissions {
  visibility?: "public" | "private";
  requiredAuth?: boolean;
  readRoles?: string[];
  writeRoles?: string[];
}

// Field Instance - An actual field using a widget with specific configuration
export interface FieldInstance {
  callback?: (args: { data: Record<string, FieldValue> }) => void;
  db_fieldName: string; // Now required (factory sets default)
  default?: FieldValue;
  display?: (args: {
    data: Record<string, FieldValue>;
    collection?: string;
    field?: FieldInstance;
    entry?: Record<string, FieldValue>;
    contentLanguage?: string;
  }) => Promise<string> | string;
  helper?: string;

  // UI properties
  icon?: string;

  // Field properties
  label: string;
  modifyRequest?: (args: {
    collection: MinimalSchema;
    field: FieldInstance;
    data: any;
    user: unknown;
    type: string;
    tenantId?: DatabaseId | null;
    collectionName?: string;
    skipValidation?: boolean;
    action?: string;
  }) => Promise<void>;
  modifyRequestBatch?: (args: {
    data: Record<string, unknown>[];
    collection: MinimalSchema;
    field: FieldInstance;
    user: unknown;
    type: string;
    tenantId?: DatabaseId | null;
    collectionName?: string;
    skipValidation?: boolean;
    action?: string;
  }) => Promise<Record<string, unknown>[]>;

  // Permissions: access control for this field (AUTH tab). Stored in widget.permissions.
  permissions?: WidgetFieldPermissions | Record<string, Record<string, boolean>>;
  required: boolean; // Now required (factory sets default)
  translated: boolean; // Now required (factory sets default)
  type?: string; // Optional field type
  unique?: boolean;
  disableUnique?: boolean;
  tenantScopedUnique?: boolean;

  // Functions
  validate?: (value: FieldValue) => boolean | Promise<boolean>;
  /** A reference to the widget's immutable definition. */
  widget: WidgetDefinition;
  width?: number;

  /** Widget-specific properties, now strongly typed by the factory. */
  [key: string]: unknown;
}

/**
 * Enterprise "Smart Join" Field (Inverse Relationship)
 * Dynamically queries another collection based on a foreign key referencing this record.
 */
export interface JoinField {
  collection: string; // The collection to join (e.g., 'comments')
  on: string; // The field in the target collection that references this record (e.g., 'post')
  where?: Record<string, unknown>; // Additional filters
  sort?: string; // Field to sort by
  limit?: number; // Max items to fetch
}

// Field definition — discriminated union with documented fallback.
// WidgetPlaceholder and JoinField are the valid structured types.
// The index-signature fallback exists for forward-compatibility with
// future field types not yet modeled. Consumer code MUST narrow via
// type guards before accessing properties.
export type FieldDefinition = WidgetPlaceholder | JoinField | { [key: string]: unknown };

// ContentTypes is now dynamic, based on collectionSchemas

// Minimal Schema interface to break circular dependencies
export interface MinimalSchema {
  _id?: string;
  name?: ContentTypes | string;
  fields: FieldDefinition[];
  [key: string]: any;
}

// Collection Schema Definition (SINGLE DEFINITION)
export interface Schema {
  _id?: string;
  description?: string;
  fields: FieldDefinition[];
  icon?: string;
  id?: number;
  label?: string;
  links?: ContentTypes[];
  livePreview?: boolean | string;
  name?: ContentTypes | string;
  order?: number;
  path?: string;
  permissions?: RolePermissions;
  plugins?: string[]; // Enabled plugin IDs for this collection
  revision?: boolean;
  revisionLimit?: number;
  slug?: string;
  status?: StatusType;
  strict?: boolean;
  tenantId?: DatabaseId | null; // For multi-tenant support
  tenantScopedUnique?: boolean; // If true, unique schema-level indexes include tenantId
  translations?: Translation[]; // Optional translations with enhanced metadata
  displaySpec?: Record<string, unknown>; // json-render-svelte display specification
}

export interface MinimalContentNode {
  name: string;
  nodeType: "category";
  path: string;
}

export interface Category {
  collections: string[];
  icon: string;
  id: number;
  name: string;
  order: number;
  subcategories?: Category[];
}

// Fix: typo ContentNodeOperatianType -> ContentNodeOperationType
export type ContentNodeOperationType = "create" | "delete" | "move" | "rename" | "update";

export interface ContentNodeOperation {
  node: ContentNode;
  type: ContentNodeOperationType;
}

// Dashboard types
export interface WidgetSize {
  h: number; // Height in grid units
  w: number; // Width in grid units
}

export interface DashboardWidgetConfig {
  component: string; // Svelte component name
  gridPosition?: number; // Optional position in the grid layout
  icon: string; // Icon identifier (iconify icon)
  id: string; // Unique widget identifier
  label: string; // Display label for the widget
  order?: number; // Optional order for sorting
  settings: Record<string, unknown>; // Widget-specific settings
  size: WidgetSize; // Widget dimensions
}

export interface Layout {
  id: string; // Layout identifier
  name: string; // Human-readable layout name
  preferences: DashboardWidgetConfig[]; // Array of widget configurations
}

export interface SystemPreferences {
  error: string | null; // Error message if any
  loading: boolean; // Loading state
  preferences: DashboardWidgetConfig[]; // Current widget preferences
}

export interface SystemPreferencesDocument {
  _id: string; // Document ID (combination of userId and layoutId)
  createdAt: ISODateString; // Creation timestamp
  layout: Layout; // Complete layout configuration
  layoutId: string; // Layout identifier
  scope: "user" | "system" | "widget"; // Preference scope
  updatedAt: ISODateString; // Last update timestamp
  userId?: string; // Optional user ID for user-scoped preferences
}

export interface DropIndicator {
  position: number;
  show: boolean;
  targetIndex?: number; // Optional target index for drop operations
}

export interface WidgetComponent {
  component: unknown; // Svelte component
  props: Record<string, unknown>;
}

export interface WidgetMeta {
  component: string;
  defaultSize: WidgetSize;
  description?: string; // Optional widget description
  icon: string;
  id: string;
  label: string;
  name?: string; // Optional widget name
  settings?: Record<string, unknown>; // Optional default settings
}

// --- Import/Export Types ---

export interface NavigationNode {
  _id: string;
  children?: NavigationNode[];
  hasChildren?: boolean;
  icon?: string;
  lastModified?: Date;
  name: string;
  nodeType: "category" | "collection";
  order?: number;
  parentId?: string;
  path?: string;
  status?: string;
  translations?: { languageTag: string; translationName: string }[];
}

export interface ExportMetadata {
  cms_version: string;
  environment: string;
  export_id: string;
  exported_at: string;
  exported_by: string;
}

export interface ExportOptions {
  collections?: string[]; // Specific collections to export
  format: "json" | "zip";
  groups?: string[]; // Specific settings groups to export
  includeCollections: boolean;
  includeSensitive: boolean;
  includeSettings: boolean;
  sensitivePassword?: string; // Password to encrypt sensitive data (required if includeSensitive is true)
}

export interface ImportOptions {
  dryRun: boolean;
  sensitivePassword?: string; // Password to decrypt sensitive data
  strategy: "skip" | "overwrite" | "merge";
  validateOnly: boolean;
}

export interface ExportData {
  collections?: CollectionExport[];
  encryptedSensitive?: string; // Encrypted sensitive data (AES-256)
  hasSensitiveData?: boolean; // Flag indicating presence of encrypted sensitive data
  metadata: ExportMetadata;
  settings?: Record<string, unknown>;
}

export interface CollectionExport {
  description?: string;
  documents?: Record<string, unknown>[];
  fields: unknown[];
  id: string;
  label: string;
  name: string;
  permissions?: string[];
  schema: unknown;
  settings?: Record<string, unknown>;
}

export interface ValidationResult {
  errors: ValidationError[];
  valid: boolean;
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  path: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  path: string;
}

export interface Conflict {
  current: unknown;
  import: unknown;
  key: string;
  recommendation: "skip" | "overwrite" | "merge";
  type: "setting" | "collection";
}

export interface ImportResult {
  conflicts: Conflict[];
  errors: ImportError[];
  imported: number;
  merged: number;
  skipped: number;
  success: boolean;
}

export interface ImportError {
  code: string;
  key: string;
  message: string;
}

// Sensitive field patterns to exclude from exports
// Moved to runtime logic in exporter if possible, but kept here for type-level reference
export const SENSITIVE_PATTERNS = [
  "PASSWORD",
  "SECRET",
  "TOKEN",
  "KEY",
  "CLIENT_SECRET",
  "PRIVATE_KEY",
  "JWT_SECRET",
  "ENCRYPTION_KEY",
  "API_KEY",
];

// ContentTypes will be auto-generated by vite plugin at build time
// For now, use string to allow dynamic collection names

export type SortOrder = 0 | 1 | -1; // Strict type for sort order

export interface TableHeader {
  id?: string;
  name?: string;
  key?: string;
  label: string;
  /** Widget type for Display-pillar list cells (entry-list). */
  widgetName?: string;
  component?: string;
  props?: Record<string, string>;
  sortable?: boolean;
  visible: boolean;
  width?: number;
}

export interface PaginationSettings {
  collectionId: string | null;
  currentPage: number;
  density: "compact" | "normal" | "comfortable";
  displayTableHeaders: TableHeader[];
  filters: Record<string, string>;
  pagesCount?: number;
  rowsPerPage: number;
  sorting: {
    sortedBy: string;
    isSorted: SortOrder;
  };
  totalItems?: number;
}

export interface TablePaginationProps {
  currentPage: number;
  onUpdatePage?: (page: number) => void;
  onUpdateRowsPerPage?: (rows: number) => void;
  pagesCount?: number;
  rowsPerPage: number;
  rowsPerPageOptions?: number[];
  totalItems?: number;
}

export type ContentTypesUnion = ContentTypes | (string & {});
