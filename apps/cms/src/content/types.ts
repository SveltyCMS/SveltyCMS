/**
 * @file src/content/types.ts
 * @description Defines the application-level TypeScript interfaces for content modeling and runtime data.
 * @summary
 * This file is the central repository for TypeScript interfaces governing the application's content
 * model and runtime data structures. It defines the "vocabulary" used across the frontend and backend
 * for entities like collections, fields, widgets, and content nodes.
 *
 * Key definitions in this file include:
 * - `Schema`: The structure of a collection.
 * - `FieldInstance`: A configured instance of a widget within a collection.
 * - `WidgetDefinition`: The blueprint for a widget.
 * - `ContentNode`: A unified type for categories and collections in the content tree.
 * - Core types like `FieldValue`, `StatusType`, and strongly-typed IDs.
 *
 * You should edit this file when you need to:
 * - Define the shape of a new content structure (e.g., a new kind of widget or field).
 * - Create a type that represents a composed or processed version of data for use in the UI.
 * - Describe the data contract for API endpoints related to content.
 */

import type { widgetFunctions as widgets } from '@stores/widgetStore.svelte';
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
	test: 'test',
	delete: 'delete'
} as const;

export type StatusType = (typeof StatusTypes)[keyof typeof StatusTypes];

// --- Strongly-Typed Identifiers ---
export type DatabaseId = string & { readonly __brand: 'DatabaseId' };
export type ISODateString = string & { readonly __isoDate: 'ISODateString' };

export interface BaseEntity {
	_id: DatabaseId;
	createdAt: ISODateString;
	updatedAt: ISODateString;
	isDeleted?: boolean; // Soft delete flag
}

// Collection Entry - A data record in a collection with common metadata
export interface CollectionEntry extends Record<string, unknown> {
	_id?: string;
	status?: StatusType;
	createdAt?: string;
	updatedAt?: string;
	createdBy?: string;
	updatedBy?: string;
	tenantId?: string;
}

// Revision Data - A historical snapshot of a collection entry
export interface RevisionData {
	_id: string;
	entryId: string;
	collectionId: string;
	data: Record<string, unknown>;
	timestamp: ISODateString;
	userId?: string;
	operation?: 'create' | 'update' | 'delete' | 'status_change';
	tenantId?: string;
	[key: string]: unknown;
}

export interface Translation {
	languageTag: string;
	translationName: string;
	isDefault?: boolean;
}

// --- Unified Content Node ---
// A single interface to represent both categories and collections in the content tree.
export interface ContentNode {
	_id: DatabaseId;
	name: string;
	nodeType: 'category' | 'collection';
	icon?: string;
	order: number;
	parentId?: DatabaseId;
	path?: string;
	translations: Translation[];
	collectionDef?: Schema; // Only present if nodeType is 'collection'
	children?: ContentNode[];
	createdAt: ISODateString;
	updatedAt: ISODateString;
	tenantId?: string; // For multi-tenant support
}

// Widget field type definition
export type WidgetKeys = keyof typeof widgets;
export type WidgetTypes = (typeof widgets)[WidgetKeys];

// Widget Definition is now imported from @widgets/types
import type { WidgetDefinition } from '@widgets/types';

// Field Instance - An actual field using a widget with specific configuration
export interface FieldInstance {
	/** A reference to the widget's immutable definition. */
	widget: WidgetDefinition;

	// Field properties
	label: string;
	db_fieldName: string; // Now required (factory sets default)
	translated: boolean; // Now required (factory sets default)
	required: boolean; // Now required (factory sets default)
	unique?: boolean;
	default?: FieldValue;

	// UI properties
	icon?: string;
	width?: number;
	helper?: string;

	// Permissions
	permissions?: Record<string, Record<string, boolean>>;

	// Functions
	validate?: (value: FieldValue) => boolean | Promise<boolean>;
	display?: (args: {
		data: Record<string, FieldValue>;
		collection?: string;
		field?: FieldInstance;
		entry?: Record<string, FieldValue>;
		contentLanguage?: string;
	}) => Promise<string> | string;
	callback?: (args: { data: Record<string, FieldValue> }) => void;
	modifyRequest?: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
	modifyRequestBatch?: (args: {
		data: Record<string, unknown>[];
		collection: unknown;
		field: unknown;
		user: unknown;
		type: string;
		tenantId?: string;
	}) => Promise<Record<string, unknown>[]>;

	/** Widget-specific properties, now strongly typed by the factory. */
	[key: string]: unknown;
}

// Field definition
export type FieldDefinition = unknown | WidgetPlaceholder;

// ContentTypes is now dynamic, based on collectionSchemas

// Collection Schema Definition (SINGLE DEFINITION)
export interface Schema {
	id?: number;
	_id?: string;
	name?: ContentTypes | string;
	label?: string;
	slug?: string;
	icon?: string;
	order?: number;
	description?: string;
	strict?: boolean;
	revision?: boolean;
	revisionLimit?: number;
	path?: string;
	permissions?: RolePermissions;
	livePreview?: boolean;
	status?: StatusType;
	links?: Array<ContentTypes>;
	fields: FieldDefinition[];
	translations?: Translation[]; // Optional translations with enhanced metadata
	tenantId?: string; // For multi-tenant support
}

export type MinimalContentNode = {
	name: string;
	path: string;
	nodeType: 'category';
};

export interface Category {
	id: number;
	name: string;
	icon: string;
	order: number;
	collections: string[];
	subcategories?: Category[];
}

export type ContentNodeOperatianType = 'create' | 'delete' | 'move' | 'rename' | 'update';

export type ContentNodeOperation = {
	type: ContentNodeOperatianType;
	node: ContentNode;
};

// Dashboard types
export interface WidgetSize {
	w: number; // Width in grid units
	h: number; // Height in grid units
}

export interface DashboardWidgetConfig {
	id: string; // Unique widget identifier
	component: string; // Svelte component name
	label: string; // Display label for the widget
	icon: string; // Icon identifier (iconify icon)
	size: WidgetSize; // Widget dimensions
	settings: Record<string, unknown>; // Widget-specific settings
	gridPosition?: number; // Optional position in the grid layout
	order?: number; // Optional order for sorting
}

export interface Layout {
	id: string; // Layout identifier
	name: string; // Human-readable layout name
	preferences: DashboardWidgetConfig[]; // Array of widget configurations
}

export interface SystemPreferences {
	preferences: DashboardWidgetConfig[]; // Current widget preferences
	loading: boolean; // Loading state
	error: string | null; // Error message if any
}

export interface SystemPreferencesDocument {
	_id: string; // Document ID (combination of userId and layoutId)
	userId?: string; // Optional user ID for user-scoped preferences
	layoutId: string; // Layout identifier
	layout: Layout; // Complete layout configuration
	scope: 'user' | 'system' | 'widget'; // Preference scope
	createdAt: ISODateString; // Creation timestamp
	updatedAt: ISODateString; // Last update timestamp
}

export interface DropIndicator {
	show: boolean;
	position: number;
	targetIndex?: number; // Optional target index for drop operations
}

export interface WidgetComponent {
	component: unknown; // Svelte component
	props: Record<string, unknown>;
}

export interface WidgetMeta {
	id: string;
	label: string;
	icon: string;
	component: string;
	defaultSize: WidgetSize;
	name?: string; // Optional widget name
	description?: string; // Optional widget description
	settings?: Record<string, unknown>; // Optional default settings
}

// --- Import/Export Types ---

export interface ExportMetadata {
	exported_at: string;
	cms_version: string;
	environment: string;
	exported_by: string;
	export_id: string;
}

export interface ExportOptions {
	includeSettings: boolean;
	includeCollections: boolean;
	includeSensitive: boolean;
	format: 'json' | 'zip';
	groups?: string[]; // Specific settings groups to export
	collections?: string[]; // Specific collections to export
	sensitivePassword?: string; // Password to encrypt sensitive data (required if includeSensitive is true)
}

export interface ImportOptions {
	strategy: 'skip' | 'overwrite' | 'merge';
	dryRun: boolean;
	validateOnly: boolean;
	sensitivePassword?: string; // Password to decrypt sensitive data
}

export interface ExportData {
	metadata: ExportMetadata;
	settings?: Record<string, unknown>;
	collections?: CollectionExport[];
	encryptedSensitive?: string; // Encrypted sensitive data (AES-256)
	hasSensitiveData?: boolean; // Flag indicating presence of encrypted sensitive data
}

export interface CollectionExport {
	id: string;
	name: string;
	label: string;
	description?: string;
	schema: unknown;
	fields: unknown[];
	permissions?: string[];
	settings?: Record<string, unknown>;
	documents?: Record<string, unknown>[];
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationWarning[];
}

export interface ValidationError {
	path: string;
	message: string;
	code: string;
}

export interface ValidationWarning {
	path: string;
	message: string;
	code: string;
}

export interface Conflict {
	type: 'setting' | 'collection';
	key: string;
	current: unknown;
	import: unknown;
	recommendation: 'skip' | 'overwrite' | 'merge';
}

export interface ImportResult {
	success: boolean;
	imported: number;
	skipped: number;
	merged: number;
	errors: ImportError[];
	conflicts: Conflict[];
}

export interface ImportError {
	key: string;
	message: string;
	code: string;
}

// Sensitive field patterns to exclude from exports
export const SENSITIVE_PATTERNS = ['PASSWORD', 'SECRET', 'TOKEN', 'KEY', 'CLIENT_SECRET', 'PRIVATE_KEY', 'JWT_SECRET', 'ENCRYPTION_KEY', 'API_KEY'];

// ContentTypes will be auto-generated by vite plugin at build time
// For now, use string to allow dynamic collection names

export type ContentTypes = 'Names' | 'Relation' | 'WidgetTest' | 'Menu' | 'Posts';

export type SortOrder = 0 | 1 | -1; // Strict type for sort order

export interface TableHeader {
	label: string;
	name: string;
	id: string;
	visible: boolean;
	width?: number;
	sortable?: boolean;
}

export interface PaginationSettings {
	collectionId: string | null;
	density: 'compact' | 'normal' | 'comfortable';
	sorting: {
		sortedBy: string;
		isSorted: SortOrder;
	};
	currentPage: number;
	rowsPerPage: number;
	filters: Record<string, string>;
	displayTableHeaders: TableHeader[];
	pagesCount?: number;
	totalItems?: number;
}

export interface TablePaginationProps {
	currentPage: number;
	pagesCount?: number;
	rowsPerPage: number;
	rowsPerPageOptions?: number[];
	totalItems?: number;
	onUpdatePage?: (page: number) => void;
	onUpdateRowsPerPage?: (rows: number) => void;
}
