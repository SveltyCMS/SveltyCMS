/**
 * @file src/widgets/core/Checkbox/index.ts
 * @description Definition of the Checkbox widget
 *
 * Implements a robust date range widget using the Three Pillars Architecture.
 *
 * @features
 */

// Components needed for the GuiSchema
import IconifyPicker from '@components/IconifyPicker.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

import { createWidget } from '@src/widgets/widgetFactory';

// Type for aggregation field parameter
type AggregationField = { db_fieldName: string; [key: string]: unknown };

import { boolean, type InferInput as ValibotInput } from 'valibot';

import type { CheckboxProps } from './types';

// ParaglideJS
import * as m from '@src/paraglide/messages';

// Define the validation schema for the data this widget stores.
const CheckboxValidationSchema = boolean('Must be a boolean.');

// Create the widget definition using the factory.
const CheckboxWidget = createWidget<CheckboxProps>({
	Name: 'Checkbox',
	Icon: 'tabler:checkbox',
	Description: m.widget_checkbox_description?.() || 'Checkbox widget for boolean values',

	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/checkbox/Input.svelte',
	displayComponentPath: '/src/widgets/core/checkbox/Display.svelte',

	// Assign the validation schema.
	validationSchema: CheckboxValidationSchema,

	// Set widget-specific defaults.
	defaults: {
		color: 'primary',
		size: 'md',
		translated: false // A simple boolean is typically not translated.
	},

	// Pass the GuiSchema directly into the widget's definition.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		icon: { widget: IconifyPicker, required: false },
		helper: { widget: Input, required: false },
		width: { widget: Input, required: false },
		permissions: { widget: PermissionsSetting, required: false }
	},

	// Correct database aggregation logic for booleans.
	aggregations: {
		filters: async ({ field, filter }: { field: AggregationField; filter: string }) => [{ $match: { [field.db_fieldName]: filter === 'true' } }],
		sorts: async ({ field, sortDirection }: { field: AggregationField; sortDirection: number }) => ({
			[field.db_fieldName]: sortDirection
		})
	},

	// GraphQL schema should return a simple Boolean.
	GraphqlSchema: () => ({
		typeID: 'Boolean', // Use primitive Boolean type
		graphql: '' // No custom type definition needed for primitives
	})
});

export default CheckboxWidget;

// Export helper types for use in Svelte components.
export type FieldType = ReturnType<typeof CheckboxWidget>;
export type CheckboxWidgetData = ValibotInput<typeof CheckboxValidationSchema>;
