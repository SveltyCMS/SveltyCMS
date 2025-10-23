/**
 * @file src/widgets/factory.ts
 * @description The definitive, type-safe Widget Factory for SveltyCMS.
 *
 * @features
 * - Generic-based for supreme type safety on widget-specific properties.
 * - Implements the "Three Pillars" architecture: Definition, Input, and Display.
 * - Integrates Valibot for declarative, type-safe data validation.
 * - Clean, modern, and free of legacy patterns.
 */

import type { FieldInstance, WidgetDefinition } from '@src/content/types';
import type { BaseIssue, BaseSchema } from 'valibot';

// A base constraint for widget-specific properties.
type WidgetProps = Record<string, unknown>;

/**
 * The configuration for DEFINING a widget's blueprint.
 * It's generic over the widget's custom props (TProps).
 */
export interface WidgetConfig<TProps extends WidgetProps = WidgetProps> {
	Name: string;
	Icon?: string;
	Description?: string;

	/** Path to the interactive INPUT component used in the editor (e.g., Fields.svelte). */
	inputComponentPath?: string;

	/** Path to the lightweight DISPLAY component for lists (e.g., EntryList.svelte). */
	displayComponentPath?: string;

	/** Type-safe default values for the widget's custom properties. */
	defaults?: Partial<TProps>;

	/**
	 * Valibot validation schema for the widget's data.
	 *  Accepts either a static schema object (Valibot BaseSchema) or a function that receives the FieldInstance and returns one.
	 *  Kept as `unknown` to avoid over-constraining the factory; callers may provide properly-typed Valibot schemas.
	 */
	validationSchema: unknown | ((field: FieldInstance) => unknown);

	// Optional advanced features
	GuiSchema?: Record<string, unknown>;
	GraphqlSchema?: (params: { field: unknown; label: string; collection: unknown; collectionNameMapping?: Map<string, string> }) => {
		typeID: string | null;
		graphql: string;
		resolver?: Record<string, unknown>;
	};
	aggregations?: unknown;
}

/**
 * The configuration for CREATING an INSTANCE of a field in a collection.
 * It combines base field properties with the widget's strongly-typed custom props.
 */
export type FieldConfig<TProps extends WidgetProps = WidgetProps> = {
	// Default
	label: string;
	db_fieldName?: string;
	required?: boolean;
	translated?: boolean;
	width?: number;
	helper?: string;
	// Permissions
	permissions?: Record<string, Record<string, boolean>>;
	// ... other common field properties
} & Partial<TProps>; // <-- Adds custom widget'sprops from types.ts

/**
 * Creates a new SveltyCMS widget factory.
 * @param config The static definition of the widget (its blueprint).
 * @returns A function that can be called to create type-safe field instances.
 */
export function createWidget<TProps extends WidgetProps = WidgetProps>(config: WidgetConfig<TProps>) {
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
		aggregations: config.aggregations
		// ... other definition properties like GraphqlSchema
	};

	// 2. Return the factory function that creates field instances.
	const widgetFactory = (fieldConfig: FieldConfig<TProps>): FieldInstance => {
		// Elegantly combine widget-defined defaults with user-provided configuration.
		const combinedProps = { ...config.defaults, ...fieldConfig };

		// Separate base fields from widget-specific props using a rest operator.
		const {
			label,
			db_fieldName,
			required,
			translated,
			width,
			helper,
			permissions,
			...widgetSpecificProps // Custom specifig Widget props
		} = combinedProps;

		const fieldInstance: FieldInstance = {
			widget: widgetDefinition,
			label,
			db_fieldName: db_fieldName || (label ? label.toLowerCase().replace(/\s+/g, '_') : 'unnamed_field'),
			required: required ?? false,
			translated: translated ?? false,
			width,
			helper,
			permissions,
			...widgetSpecificProps // Spread the strongly-typed custom props.
		};

		return fieldInstance;
	};

	// 3. Attach metadata to the factory for compatibility with existing system
	widgetFactory.Name = config.Name;
	widgetFactory.Icon = config.Icon;
	widgetFactory.Description = config.Description;
	widgetFactory.GuiSchema = config.GuiSchema;
	widgetFactory.GraphqlSchema = config.GraphqlSchema;
	widgetFactory.aggregations = config.aggregations;
	widgetFactory.__inputComponentPath = config.inputComponentPath || '';
	widgetFactory.__displayComponentPath = config.displayComponentPath || '';
	widgetFactory.toString = () => '';

	// 4. Return the clean factory.
	return widgetFactory;
}
