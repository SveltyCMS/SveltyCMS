/**
 * @file src/widgets/widgetFactory.ts
 * @description The definitive, type-safe Widget Factory for SveltyCMS.
 *
 * @features
 * - Generic-based for supreme type safety on widget-specific properties.
 * - Implements the "Three Pillars" architecture: Definition, Input, and Display.
 * - Integrates Valibot for declarative, type-safe data validation.
 * - Clean, modern, and free of legacy patterns.
 */

import type { FieldInstance } from '@src/content/types';
import { registerForJsonRender } from '@src/services/json-render/catalog';
import type { WidgetDefinition, WidgetFactory } from '@widgets/types';
import type { BaseIssue, BaseSchema } from 'valibot';

// A base constraint for widget-specific properties.
type WidgetProps = Record<string, unknown>;

export type FieldConfig<TProps extends WidgetProps = WidgetProps> = {
	widget?: WidgetDefinition;
	label?: string;
	db_fieldName?: string;
	permissions?: Partial<Record<'read' | 'write', string[]>>;
	[key: string]: unknown;
} & TProps;

/**
 * The configuration for DEFINING a widget's blueprint.
 * It's generic over the widget's custom props (TProps).
 */
export interface WidgetConfig<TProps extends WidgetProps = WidgetProps> {
	aggregations?: unknown;
	Description?: string;

	/** Type-safe default values for the widget's custom properties. */
	defaults?: Partial<TProps>;

	/** Path to the lightweight DISPLAY component for lists (e.g., EntryList.svelte). */
	displayComponentPath?: string;
	GraphqlSchema?: (params: { field: unknown; label: string; collection: unknown; collectionNameMapping?: Map<string, string> }) => {
		typeID: string | null;
		graphql: string;
		resolver?: Record<string, unknown>;
	};

	// Optional advanced features
	GuiSchema?: Record<string, unknown>;

	/** Optional function to return widget-specific translatable paths. */
	getTranslatablePaths?: (basePath: string) => string[];
	Icon?: string;

	/** Path to the interactive INPUT component used in the editor (e.g., Fields.svelte). */
	inputComponentPath?: string;

	/** Optional function to modify the request data on the server. */
	modifyRequest?: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;

	/** Optional function to modify a batch of request data on the server. */
	modifyRequestBatch?: (args: {
		data: Record<string, unknown>[];
		collection: unknown;
		field: unknown;
		user: unknown;
		type: string;
		tenantId?: string;
	}) => Promise<Record<string, unknown>[]>;
	Name: string;

	/**
	 * Valibot validation schema for the widget's data.
	 *  Accepts either a static schema object (Valibot BaseSchema) or a function that receives the FieldInstance and returns one.
	 *  Kept as `unknown` to avoid over-constraining the factory; callers may provide properly-typed Valibot schemas.
	 */
	validationSchema: unknown | ((field: FieldInstance) => unknown);

	/** Optional json-render configuration for AI-native generative layouts. */
	jsonRender?: boolean | Record<string, unknown>;
}

/**
 * Creates a new SveltyCMS widget factory.
 * @param config The static definition of the widget (its blueprint).
 * @returns A function that can be called to create type-safe field instances.
 */
export function createWidget<TProps extends WidgetProps = WidgetProps>(config: WidgetConfig<TProps>): WidgetFactory<TProps> {
	// 1. Create the immutable widget definition once.
	// This now includes all the "Three Pillars" information.
	const widgetDefinition: WidgetDefinition = {
		widgetId: config.Name,
		Name: config.Name,
		Icon: config.Icon,
		Description: config.Description,
		inputComponentPath: config.inputComponentPath || '',
		displayComponentPath: config.displayComponentPath || '',
		// validationSchema may be a function or a static schema. Keep as-is so other systems can call it.
		validationSchema: config.validationSchema as unknown as BaseSchema<unknown, unknown, BaseIssue<unknown>>,
		defaults: config.defaults,
		GuiFields: config.GuiSchema || ({} as Record<string, unknown>),
		aggregations: config.aggregations as WidgetDefinition['aggregations'],
		getTranslatablePaths: config.getTranslatablePaths,
		// json-render integration
		jsonRender: config.jsonRender
		// ... other definition properties like GraphqlSchema
	};

	if (config.jsonRender) {
		// Automatically register this widget in the central json-render catalog
		registerForJsonRender(widgetDefinition);
	}

	// 2. Return the factory function that creates field instances.
	const widgetFactoryFunction = (fieldConfig: FieldConfig<TProps>): FieldInstance => {
		const fieldInstance: FieldInstance = {
			widget: widgetDefinition,
			label: fieldConfig.label, // Will be overridden by fieldConfig later if present
			db_fieldName: '', // Will be set below
			required: false, // Will be overridden by fieldConfig or config.defaults later
			translated: false, // Will be overridden by fieldConfig or config.defaults later
			width: undefined, // Will be overridden by fieldConfig or config.defaults later
			helper: undefined, // Will be overridden by fieldConfig or config.defaults later
			permissions: undefined, // Will be overridden by fieldConfig or config.defaults later
			modifyRequest: config.modifyRequest,
			modifyRequestBatch: config.modifyRequestBatch
		} as FieldInstance; // Cast to FieldInstance to allow adding custom properties

		// 1. Apply defaults from config.defaults (for custom properties)
		if (config.defaults) {
			// logger.debug(`[WidgetFactory] Applying defaults for ${config.Name}`, { defaults: config.defaults });
			for (const key in config.defaults) {
				if (Object.hasOwn(config.defaults, key)) {
					const value = (config.defaults as Record<string, unknown>)[key];
					(fieldInstance as Record<string, unknown>)[key] = value;
				}
			}
		}

		// 2. Apply fieldConfig properties, overriding defaults and initial standard values
		for (const key in fieldConfig) {
			if (Object.hasOwn(fieldConfig, key)) {
				const value = (fieldConfig as Record<string, unknown>)[key];
				if (value !== undefined) {
					// Only apply if not undefined
					(fieldInstance as Record<string, unknown>)[key] = value;
				}
			}
		}

		// 3. Handle specific standard property defaults and generation after all merges
		fieldInstance.required = fieldInstance.required ?? false;
		fieldInstance.translated = fieldInstance.translated ?? false;
		if (!fieldInstance.db_fieldName && fieldInstance.label) {
			fieldInstance.db_fieldName = fieldInstance.label
				.toLowerCase()
				.replace(/\s+/g, '_')
				.replace(/[^a-z0-9_]/g, '');
		} else if (!fieldInstance.db_fieldName) {
			fieldInstance.db_fieldName = 'unnamed_field';
		}

		return fieldInstance;
	};

	// 3. Attach metadata to the factory for compatibility with existing system
	widgetFactoryFunction.Name = config.Name;
	widgetFactoryFunction.Icon = config.Icon;
	widgetFactoryFunction.Description = config.Description;
	widgetFactoryFunction.GuiSchema = config.GuiSchema;
	widgetFactoryFunction.GraphqlSchema = config.GraphqlSchema;
	widgetFactoryFunction.aggregations = config.aggregations as WidgetDefinition['aggregations'];
	widgetFactoryFunction.__inputComponentPath = config.inputComponentPath || '';
	widgetFactoryFunction.__displayComponentPath = config.displayComponentPath || '';
	widgetFactoryFunction.toString = () => '';

	// 4. Return the clean factory.
	return widgetFactoryFunction as WidgetFactory<TProps>;
}
