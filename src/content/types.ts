/** @file src/content/types.ts @description Application-level TypeScript interfaces for content modeling and runtime data features: [Schema/Field/Widget definitions, base entity metadata, revision tracking, unified content node, dashboard configurations] */

import type { WidgetRegistry as widgets } from '@src/stores/widget-store.svelte.ts';
// Note: collectionSchemas may be used in the future for runtime validation

// Auth
import type { RolePermissions } from '@src/databases/auth/types';
import type { WidgetPlaceholder } from '@src/widgets/placeholder';

// Define core value and status types
export type FieldValue = string | number | boolean | object | null;
// Status types for collections and entries
export const StatusTypes = {
	archive: 'archive',
	draft: 'draft',
	publish: 'publish',
	unpublish: 'unpublish',
	schedule: 'schedule',
	clone: 'clone',
	delete: 'delete'
} as const;

export type StatusType = (typeof StatusTypes)[keyof typeof StatusTypes];

// --- Strongly-Typed Identifiers ---
export type DatabaseId = string & { readonly __brand: 'DatabaseId' };
export type ISODateString = string & { readonly __isoDate: 'ISODateString' };

export interface BaseEntity {
	_id: DatabaseId;
	createdAt: ISODateString;
	deletedAt?: ISODateString; // Timestamp of deletion
	deletedBy?: string; // User who performed deletion
	isDeleted?: boolean; // Soft delete flag
	tenantId?: string; // For multi-tenant support
	updatedAt: ISODateString;
}

// Collection Entry - A data record in a collection with common metadata
export interface CollectionEntry extends Record<string, unknown> {
	_id?: string;
	createdAt?: string;
	createdBy?: string;
	status?: StatusType;
	tenantId?: string;
	updatedAt?: string;
	updatedBy?: string;
}

// Revision Data - A historical snapshot of a collection entry
export interface RevisionData {
	_id: string;
	collectionId: string;
	data: Record<string, unknown>;
	entryId: string;
	operation?: 'create' | 'update' | 'delete' | 'status_change';
	tenantId?: string;
	timestamp: ISODateString;
	userId?: string;
	[key: string]: unknown;
}

export interface Translation {
	isDefault?: boolean;
	languageTag: string;
	translationName: string;
}

// --- Unified Content Node ---
// A single interface to represent both categories and collections in the content tree.
export interface ContentNode {
	_id: DatabaseId;
	children?: ContentNode[];
	collectionDef?: Schema; // Only present if nodeType is 'collection'
	createdAt: ISODateString;
	deletedAt?: ISODateString; // Timestamp of deletion
	deletedBy?: string; // User who performed deletion
	description?: string;
	icon?: string;
	name: string;
	nodeType: 'category' | 'collection';
	order: number;
	parentId?: DatabaseId;
	path?: string;
	slug?: string;
	tenantId?: string; // For multi-tenant support
	translations: Translation[];
	updatedAt: ISODateString;
}

// Widget field type definition
export type WidgetKeys = keyof widgets;
export type WidgetTypes = widgets[WidgetKeys];

// Widget Definition is now imported from @widgets/types
import type { WidgetDefinition } from '@widgets/types';

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
	tenantId?: string;
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
	modifyRequest?: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
	modifyRequestBatch?: (args: {
		data: Record<string, unknown>[];
		collection: unknown;
		field: unknown;
		user: unknown;
		type: string;
		tenantId?: string;
	}) => Promise<Record<string, unknown>[]>;

	// Permissions
	permissions?: Record<string, Record<string, boolean>>;
	required: boolean; // Now required (factory sets default)
	translated: boolean; // Now required (factory sets default)
	type?: string; // Optional field type
	unique?: boolean;

	// Functions
	validate?: (value: FieldValue) => boolean | Promise<boolean>;
	/** A reference to the widget's immutable definition. */
	widget: WidgetDefinition;
	width?: number;

	/** Widget-specific properties, now strongly typed by the factory. */
	[key: string]: unknown;
}

// Field definition
export type FieldDefinition = unknown | WidgetPlaceholder;

// ContentTypes is now dynamic, based on collectionSchemas

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
	tenantId?: string; // For multi-tenant support
	translations?: Translation[]; // Optional translations with enhanced metadata
}

export interface MinimalContentNode {
	name: string;
	nodeType: 'category';
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

export type ContentNodeOperatianType = 'create' | 'delete' | 'move' | 'rename' | 'update';

export interface ContentNodeOperation {
	node: ContentNode;
	type: ContentNodeOperatianType;
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
	scope: 'user' | 'system' | 'widget'; // Preference scope
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

export interface ExportMetadata {
	cms_version: string;
	environment: string;
	export_id: string;
	exported_at: string;
	exported_by: string;
}

export interface ExportOptions {
	collections?: string[]; // Specific collections to export
	format: 'json' | 'zip';
	groups?: string[]; // Specific settings groups to export
	includeCollections: boolean;
	includeSensitive: boolean;
	includeSettings: boolean;
	sensitivePassword?: string; // Password to encrypt sensitive data (required if includeSensitive is true)
}

export interface ImportOptions {
	dryRun: boolean;
	sensitivePassword?: string; // Password to decrypt sensitive data
	strategy: 'skip' | 'overwrite' | 'merge';
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
	recommendation: 'skip' | 'overwrite' | 'merge';
	type: 'setting' | 'collection';
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
export const SENSITIVE_PATTERNS = ['PASSWORD', 'SECRET', 'TOKEN', 'KEY', 'CLIENT_SECRET', 'PRIVATE_KEY', 'JWT_SECRET', 'ENCRYPTION_KEY', 'API_KEY'];

// ContentTypes will be auto-generated by vite plugin at build time
// For now, use string to allow dynamic collection names

export type SortOrder = 0 | 1 | -1; // Strict type for sort order

export interface TableHeader {
	component?: string;
	id: string;
	label: string;
	name: string;
	props?: Record<string, string>;
	sortable?: boolean;
	visible: boolean;
	width?: number;
}

export interface PaginationSettings {
	collectionId: string | null;
	currentPage: number;
	density: 'compact' | 'normal' | 'comfortable';
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

/* AUTOGEN_START: ContentTypes */
export type ContentTypes = never;
/* AUTOGEN_END: ContentTypes */
