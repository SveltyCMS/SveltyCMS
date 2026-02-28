/**
 * @file src/widgets/types.ts
 * @description Improved widget types aligned with factory pattern
 *
 * Key improvements:
 * - Better alignment with createWidget factory
 * - Stronger type safety with generics
 * - Clearer separation of concerns
 * - Support for 3-pillar architecture
 */

import type { User } from '@src/databases/auth/types';
import type { GuiFieldConfig } from '@utils/utils';
import type { SvelteComponent } from 'svelte';
import type { FieldInstance, Schema } from '../content/types';

// ============================================================================
// Widget Type Classification
// ============================================================================

export type WidgetType = 'core' | 'custom' | 'marketplace';

export interface WidgetMetadata {
	author?: string;
	dependencies?: string[];
	tags?: string[];
	type: WidgetType;
	version?: string;
}

// ============================================================================
// Widget Definition (The Blueprint)
// ============================================================================

/**
 * The immutable definition of a widget - created once by the factory
 * This is what gets stored in the widget registry
 */
export interface WidgetDefinition<TProps extends Record<string, unknown> = Record<string, unknown>> {
	aggregations?: {
		filters?: (params: { field: FieldInstance; filter: string; contentLanguage: string }) => Promise<unknown[]>;
		sorts?: (params: { field: FieldInstance; sortDirection: number; contentLanguage: string }) => Promise<Record<string, number>>;
	};
	Description?: string;

	// Default values for widget-specific props
	defaults?: Partial<TProps>;
	displayComponentPath?: string;

	// Generic translation support
	// getTranslatablePaths is already defined above in WidgetDefinition interface
	// Removing duplicate definition

	// Optional advanced features
	GraphqlSchema?: (params: { field: unknown; label: string; collection: unknown; collectionNameMapping?: Map<string, string> }) => {
		typeID: string | null;
		graphql: string;
		resolver?: Record<string, unknown>;
	};

	// Configuration UI in Collection Builder
	GuiFields?: Record<string, unknown>;
	GuiSchema?: Record<string, unknown>; // Compatibility for legacy widgets

	/** Optional request modification handler */
	modifyRequest?: (args: {
		collection: unknown;
		collectionName?: string;
		data: unknown;
		field: FieldInstance;
		tenantId?: string;
		type: string;
		user: User;
	}) => Promise<unknown> | unknown;

	/** Optional batch request modification handler */
	modifyRequestBatch?: (args: {
		collection: unknown;
		collectionName?: string;
		data: Record<string, unknown>[];
		field: FieldInstance;
		tenantId?: string;
		type: string;
		user: User;
	}) => Promise<Record<string, unknown>[]>;

	/** Optional function to return widget-specific translatable paths. */
	getTranslatablePaths?: (basePath: string) => string[];
	Icon?: string;

	// 3-Pillar Architecture paths
	inputComponentPath?: string;

	// Metadata
	metadata?: WidgetMetadata;
	Name: string;

	// Validation (can be static schema or function)
	validationSchema: unknown | ((field: FieldInstance) => unknown);
	// Core identity
	widgetId: string;

	/**
	 * json-render-svelte configuration for AI-native generative layouts.
	 * If true, uses default extraction. If object, specifies custom config.
	 */
	jsonRender?: boolean | Record<string, unknown>;
}

// ============================================================================
// Widget Factory Function (What createWidget returns)
// ============================================================================

/**
 * The factory function that creates field instances
 * This is what collection authors use in their schemas
 */
export interface WidgetFactory<TProps extends Record<string, unknown> = Record<string, unknown>> {
	__dependencies?: string[];
	__displayComponentPath?: string;
	__inputComponentPath?: string;
	__widgetType?: WidgetType;
	aggregations?: WidgetDefinition['aggregations'];
	Description?: string;
	GraphqlSchema?: WidgetDefinition['GraphqlSchema'];
	GuiSchema?: Record<string, unknown>;
	Icon?: string;
	modifyRequest?: WidgetDefinition['modifyRequest'];
	modifyRequestBatch?: WidgetDefinition['modifyRequestBatch'];

	// Static properties attached to the function (for compatibility)
	Name: string;

	// String representation
	toString(): string;
	// The callable function that creates field instances
	(config: FieldConfig<TProps>): FieldInstance;
}

// ============================================================================
// Field Configuration (What collection authors provide)
// ============================================================================

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

// ============================================================================
// Legacy Compatibility Types (for gradual migration)
// ============================================================================

/**
 * @deprecated Use WidgetFactory instead
 * Legacy widget function type for backward compatibility
 */
export interface Widget {
	__dependencies?: string[];
	__displayComponentPath?: string;
	__inputComponentPath?: string;
	__widgetType?: WidgetType;
	aggregations?: unknown;
	componentPath?: string;
	Description?: string;
	GraphqlSchema?: unknown;
	GuiSchema?: SvelteComponent;
	Icon?: string;
	Name: string;
	(field: FieldInstance): FieldInstance;
}

/**
 * @deprecated Use WidgetFactory instead
 * Legacy widget function type
 */
export interface WidgetFunction {
	__dependencies?: string[];
	__displayComponentPath?: string;
	__inputComponentPath?: string;
	__isCore?: boolean;
	__widgetId?: string;
	__widgetType?: WidgetType;
	aggregations?: unknown;
	componentPath?: string;
	Description?: string;
	GraphqlSchema?: unknown;
	GuiSchema?: typeof SvelteComponent | Record<string, unknown>;
	Icon?: string;
	Name: string;
	(config: Record<string, unknown>): Widget;
}

// ============================================================================
// Widget Module (for dynamic imports)
// ============================================================================

export interface WidgetModule {
	default: WidgetFactory;
}

// ============================================================================
// Widget Runtime Parameters
// ============================================================================

/**
 * Parameters passed to widget components at runtime
 */
export interface WidgetParam {
	config: GuiFieldConfig;
	field: FieldInstance;
	onValueChange: (value: unknown) => void;
	placeholder: WidgetPlaceholder;
	schema: Schema;
	user: User;
	value: unknown;
	values: unknown;
}

// ============================================================================
// Widget Placeholder (for lazy loading)
// ============================================================================

export interface WidgetPlaceholder {
	__widgetConfig: Record<string, unknown>;
	__widgetId: string;
	__widgetName: string;
}

// ============================================================================
// Widget Registry Types
// ============================================================================

/**
 * Widget registry entry combining definition and runtime info
 */
export interface WidgetRegistryEntry {
	definition: WidgetDefinition;
	error?: string;
	factory: WidgetFactory;
	loadedAt?: Date;
	metadata: WidgetMetadata;
	status: 'active' | 'inactive' | 'error';
}

/**
 * Widget registry for managing all widgets
 */
export interface WidgetRegistry {
	// Get a widget factory by ID
	get(widgetId: string): WidgetFactory | undefined;

	// Get widgets by type
	getByType(type: WidgetType): WidgetRegistryEntry[];

	// Check if a widget is registered
	has(widgetId: string): boolean;

	// List all widget IDs
	list(): string[];

	// Register a new widget
	register(widgetId: string, entry: WidgetRegistryEntry): void;

	// Unregister a widget
	unregister(widgetId: string): void;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isWidgetFactory(value: unknown): value is WidgetFactory {
	return typeof value === 'function' && 'Name' in value && typeof (value as WidgetFactory).Name === 'string';
}

export function isWidgetDefinition(value: unknown): value is WidgetDefinition {
	return typeof value === 'object' && value !== null && 'widgetId' in value && 'Name' in value && 'validationSchema' in value;
}

export function isFieldInstance(value: unknown): value is FieldInstance {
	return typeof value === 'object' && value !== null && 'widget' in value && 'label' in value && 'db_fieldName' in value;
}
