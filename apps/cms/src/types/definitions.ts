/**
 * @file apps/cms/src/types/definitions.ts
 * @description Combined core types to resolve circular dependencies between content and widgets
 *
 * ### Features:
 * - MinimalContentNode
 */

import type { SvelteComponent } from 'svelte';

// --- From content.ts ---

// Define core value and status types
export type FieldValue = string | number | boolean | object | null;

// Status types for collections and entries
// Status types are now imported from shared database interface
// import { StatusTypes } from '@shared/database/dbInterface'; // We need to export it from there first if we want to use the value.
// Actually, let's just re-export them from dbInterface.

// --- From content.ts ---

// Re-export StatusTypes from shared
import { StatusTypes } from '@shared/database/dbInterface';
export { StatusTypes };
import type { StatusType } from '@shared/database/dbInterface';
export type { StatusType };

// --- Strongly-Typed Identifiers ---
import type { DatabaseId, ISODateString, BaseEntity, Translation, ContentNode, Schema } from '@shared/database/dbInterface';
export type { DatabaseId, ISODateString, BaseEntity, Translation, ContentNode, Schema };

export interface ContentNodeOperation {
	type: 'create' | 'update' | 'delete' | 'move' | 'rename';
	node: ContentNode;
}

export type ConfigEntity = {
	uuid: string;
	type: string;
	name: string;
	hash: string;
	entity: Record<string, unknown>;
};

export type ConfigSyncStatus = {
	status: 'in_sync' | 'changes_detected';
	changes: { new: ConfigEntity[]; updated: ConfigEntity[]; deleted: ConfigEntity[] };
	unmetRequirements: Array<{ key: string; value?: unknown }>;
};

export interface NavigationNode {
	_id: string;
	name: string;
	path?: string;
	icon?: string;
	nodeType: 'category' | 'collection';
	order: number;
	parentId?: string;
	translations: Translation[];
	children?: NavigationNode[];
	hasChildren?: boolean;
}

export interface IContentManager {
	initialize(tenantId?: string): Promise<void>;
	getCollections(tenantId?: string): Promise<Schema[]>;
	getCollection(identifier: string, tenantId?: string): Promise<Schema | undefined | null>;
	getCollectionById(collectionId: string, tenantId?: string): Promise<Schema | undefined | null>;
	getCollectionStats(identifier: string, tenantId?: string): Promise<any>;
	getFirstCollection(tenantId?: string, forceRefresh?: boolean): Promise<Schema | undefined | null>;
	getFirstCollectionRedirectUrl(language?: string, tenantId?: string): Promise<string | null>;
	clearFirstCollectionCache(): void;
	getContentStructure(): Promise<ContentNode[]>;
	getNavigationStructure(): Promise<NavigationNode[]>;
	getNavigationStructureProgressive(options?: { maxDepth?: number; expandedIds?: Set<string>; tenantId?: string }): Promise<NavigationNode[]>;
	getNodeChildren(nodeId: string, tenantId?: string): ContentNode[];
	preloadAdjacentCollections(nodeId: string, depth?: number): Promise<void>;
	getContentStructureFromDatabase(format?: 'flat' | 'nested'): Promise<ContentNode[]>;
}

export interface MinimalContentNode {
	name: string;
	path: string;
	nodeType: 'category';
}

// Field Instance - An actual field using a widget with specific configuration
export interface FieldInstance {
	/** A reference to the widget's immutable definition. */
	widget: WidgetDefinition;

	// Field properties
	label: string;
	db_fieldName: string;
	translated: boolean;
	required: boolean;
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

// Schema is imported from @shared/database/dbInterface

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

// Helper interface for drag and drop visual feedback
export interface DropIndicator {
	show: boolean;
	position: number;
	targetIndex: number;
}

export interface Layout {
	id: string; // Layout identifier
	name: string; // Human-readable layout name
	preferences: DashboardWidgetConfig[]; // Array of widget configurations
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

export interface CollectionEntry extends Record<string, unknown> {
	_id?: string;
	status?: StatusType;
	statusByLocale?: Record<string, StatusType>;
	_scheduled?: string;
	_scheduledByLocale?: Record<string, string>;
	createdAt?: string;
	updatedAt?: string;
	createdBy?: string;
	updatedBy?: string;
	tenantId?: string;
}

// Sort Order Type
export type SortOrder = 0 | 1 | -1;

// Pagination Settings for EntryList
export interface PaginationSettings {
	currentPage: number;
	rowsPerPage: number;
	totalItems: number;
	pagesCount: number;
	sorting: {
		sortedBy: string;
		isSorted: SortOrder;
	};
	filters: Record<string, string>;
	displayTableHeaders: TableHeader[];
	collectionId: string | null;
	density: 'compact' | 'normal' | 'comfortable';
}

// Table Header for EntryList
// Table Header for EntryList
export interface TableHeader {
	id?: string;
	name: string;
	label: string;
	sortable?: boolean;
	width?: string;
	field?: string;
	visible?: boolean;
}

// EntryList Props Definition
export interface EntryListProps {
	entries: CollectionEntry[];
	pagination: PaginationSettings;
	contentLanguage: string;
}

// TablePagination Props Definition
export interface TablePaginationProps {
	currentPage: number;
	pagesCount: number;
	rowsPerPage: number;
	rowsPerPageOptions?: number[];
	totalItems: number;
	onUpdatePage?: (page: number) => void;
	onUpdateRowsPerPage?: (rows: number) => void;
}

// Dashboard Widget Component and Meta Definitions
import type { Component } from 'svelte';
export type WidgetComponent = Component<any>;

export interface WidgetMeta {
	name: string;
	icon: string;
	defaultSize: WidgetSize;
	description?: string;
	settings?: Record<string, unknown>;
}

// --- From widgets.ts ---

export interface GuiFieldConfig {
	widget: unknown;
	required: boolean;
}

export type WidgetType = 'core' | 'custom' | 'marketplace';

export interface WidgetMetadata {
	type: WidgetType;
	version?: string;
	author?: string;
	dependencies?: string[];
	tags?: string[];
}

/**
 * The immutable definition of a widget - created once by the factory
 * This is what gets stored in the widget registry
 */
export interface WidgetDefinition<TProps extends Record<string, unknown> = Record<string, unknown>> {
	// Core identity
	widgetId: string;
	Name: string;
	Icon?: string;
	Description?: string;

	// 3-Pillar Architecture paths
	inputComponentPath?: string;
	displayComponentPath?: string;

	// Validation (can be static schema or function)
	validationSchema: unknown | ((field: FieldInstance) => unknown);

	/** Optional function to return widget-specific translatable paths. */
	getTranslatablePaths?: (basePath: string) => string[];

	// Default values for widget-specific props
	defaults?: Partial<TProps>;

	// Configuration UI in Collection Builder
	GuiFields?: Record<string, unknown>;
	GuiSchema?: Record<string, unknown>; // Compatibility for legacy widgets

	// Optional advanced features
	GraphqlSchema?: (params: { field: unknown; label: string; collection: unknown; collectionNameMapping?: Map<string, string> }) => {
		typeID: string | null;
		graphql: string;
		resolver?: Record<string, unknown>;
	};

	aggregations?: {
		filters?: (params: { field: FieldInstance; filter: string; contentLanguage: string }) => Promise<unknown[]>;
		sorts?: (params: { field: FieldInstance; sortDirection: number; contentLanguage: string }) => Promise<Record<string, number>>;
	};

	// Metadata
	metadata?: WidgetMetadata;
}

/**
 * The factory function that creates field instances
 * This is what collection authors use in their schemas
 */
export interface WidgetFactory<TProps extends Record<string, unknown> = Record<string, unknown>> {
	// The callable function that creates field instances
	(config: FieldConfig<TProps>): FieldInstance;

	// Static properties attached to the function (for compatibility)
	Name: string;
	Icon?: string;
	Description?: string;
	GuiSchema?: Record<string, unknown>;
	GraphqlSchema?: WidgetDefinition['GraphqlSchema'];
	aggregations?: WidgetDefinition['aggregations'];
	__inputComponentPath?: string;
	__displayComponentPath?: string;
	__widgetType?: WidgetType;
	__dependencies?: string[];

	// String representation
	toString(): string;
}

/**
 * Configuration for creating a field instance
 * Combines standard field properties with widget-specific props
 */
export type FieldConfig<TProps extends Record<string, unknown> = Record<string, unknown>> = {
	// Standard field properties
	label: string;
	db_fieldName?: string;
	required?: boolean;
	translated?: boolean;
	width?: number;
	helper?: string;
	icon?: string;
	disabled?: boolean;
	readonly?: boolean;

	// Permissions
	permissions?: Record<string, Record<string, boolean>>;
} & Partial<TProps>; // Widget-specific props

/**
 * @deprecated Use WidgetFactory instead
 */
export interface Widget {
	(field: FieldInstance): FieldInstance;
	Name: string;
	Icon?: string;
	Description?: string;
	GuiSchema?: SvelteComponent;
	GraphqlSchema?: unknown;
	aggregations?: unknown;
	__widgetType?: WidgetType;
	__dependencies?: string[];
	__inputComponentPath?: string;
	__displayComponentPath?: string;
	componentPath?: string;
}

/**
 * @deprecated Use WidgetFactory instead
 */
export interface WidgetFunction {
	(config: Record<string, unknown>): Widget;
	__widgetId?: string;
	Name: string;
	GuiSchema?: typeof SvelteComponent | Record<string, unknown>;
	GraphqlSchema?: unknown;
	Icon?: string;
	Description?: string;
	aggregations?: unknown;
	__widgetType?: WidgetType;
	__isCore?: boolean;
	__dependencies?: string[];
	__inputComponentPath?: string;
	__displayComponentPath?: string;
	componentPath?: string;
}

export type WidgetModule = {
	default: WidgetFactory;
};

/**
 * Parameters passed to widget components at runtime
 */
export type WidgetParam = {
	field: FieldInstance;
	schema: Schema;
	user: any; // Use any for now or import User from auth types if available
	value: unknown;
	values: unknown;
	onValueChange: (value: unknown) => void;
	config: GuiFieldConfig;
	placeholder: WidgetPlaceholder;
};

export interface WidgetPlaceholder {
	__widgetId: string;
	__widgetName: string;
	__widgetConfig: Record<string, unknown>;
}

export interface WidgetRegistryEntry {
	definition: WidgetDefinition;
	factory: WidgetFactory;
	status: 'active' | 'inactive' | 'error';
	metadata: WidgetMetadata;
	loadedAt?: Date;
	error?: string;
}

export interface ExportMetadata {
	exported_at: string;
	cms_version: string;
	export_id: string;
	environment?: string;
	exported_by?: string;
}

export interface ExportOptions {
	includeSettings: boolean;
	includeCollections: boolean;
	includeSensitive?: boolean;
	format?: 'json' | 'yaml';
	groups?: string[];
	collections?: string[];
	sensitivePassword?: string;
}

export interface CollectionExport extends Record<string, unknown> {
	id: string;
	name: string;
}

export interface ExportData {
	metadata: ExportMetadata;
	settings?: Record<string, unknown>;
	collections?: any[];
	hasSensitiveData?: boolean;
	encryptedSensitive?: string;
}

export interface ImportOptions {
	strategy: 'overwrite' | 'skip' | 'merge';
	dryRun?: boolean;
	validateOnly?: boolean;
	sensitivePassword?: string;
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

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationWarning[];
}

export interface Conflict {
	type: 'setting' | 'collection';
	key: string;
	current: unknown;
	import: unknown;
	recommendation?: 'overwrite' | 'skip' | 'merge';
}

export interface ImportResult {
	success: boolean;
	imported: number;
	skipped: number;
	merged: number;
	errors: { key: string; message: string; code: string }[];
	conflicts: Conflict[];
}
