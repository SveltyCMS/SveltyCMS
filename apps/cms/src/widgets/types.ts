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

import type { SvelteComponent } from 'svelte';
import type { FieldInstance, Schema } from '../content/types';
import type { User } from '@src/databases/auth/types';
import type { GuiFieldConfig } from '@utils/utils';
import type { BaseIssue, BaseSchema } from 'valibot';

// ============================================================================
// Widget Type Classification
// ============================================================================

export type WidgetType = 'core' | 'custom' | 'marketplace';

export interface WidgetMetadata {
	type: WidgetType;
	version?: string;
	author?: string;
	dependencies?: string[];
	tags?: string[];
}

// ============================================================================
// Widget Definition (The Blueprint)
// ============================================================================

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
	validationSchema: BaseSchema<unknown, unknown, BaseIssue<unknown>> | ((field: FieldInstance) => BaseSchema<unknown, unknown, BaseIssue<unknown>>);

	// Default values for widget-specific props
	defaults?: Partial<TProps>;

	// Configuration UI in Collection Builder
	GuiFields?: Record<string, unknown>;

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

// ============================================================================
// Widget Factory Function (What createWidget returns)
// ============================================================================

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
 * Legacy widget function type
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

// ============================================================================
// Widget Module (for dynamic imports)
// ============================================================================

export type WidgetModule = {
	default: WidgetFactory;
};

// ============================================================================
// Widget Runtime Parameters
// ============================================================================

/**
 * Parameters passed to widget components at runtime
 */
export type WidgetParam = {
	field: FieldInstance;
	schema: Schema;
	user: User;
	value: unknown;
	values: unknown;
	onValueChange: (value: unknown) => void;
	config: GuiFieldConfig;
	placeholder: WidgetPlaceholder;
};

// ============================================================================
// Widget Placeholder (for lazy loading)
// ============================================================================

export interface WidgetPlaceholder {
	__widgetId: string;
	__widgetName: string;
	__widgetConfig: Record<string, unknown>;
}

// ============================================================================
// Widget Registry Types
// ============================================================================

/**
 * Widget registry entry combining definition and runtime info
 */
export interface WidgetRegistryEntry {
	definition: WidgetDefinition;
	factory: WidgetFactory;
	status: 'active' | 'inactive' | 'error';
	metadata: WidgetMetadata;
	loadedAt?: Date;
	error?: string;
}

/**
 * Widget registry for managing all widgets
 */
export interface WidgetRegistry {
	// Get a widget factory by ID
	get(widgetId: string): WidgetFactory | undefined;

	// Register a new widget
	register(widgetId: string, entry: WidgetRegistryEntry): void;

	// Unregister a widget
	unregister(widgetId: string): void;

	// List all widget IDs
	list(): string[];

	// Get widgets by type
	getByType(type: WidgetType): WidgetRegistryEntry[];

	// Check if a widget is registered
	has(widgetId: string): boolean;
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
