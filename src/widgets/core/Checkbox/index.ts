/**
 * @file src/widgets/core/Checkbox/index.ts
 * @description Definition of the Checkbox widget
 *
 * Implements a robust date range widget using the Three Pillars Architecture.
 *
 * @features
 */

// Components needed for the GuiSchema
// import IconifyIconsPicker from '@components/iconify-icons-picker.svelte';
// import PermissionsSetting from '@components/permissions-setting.svelte';
// import Input from '@components/system/inputs/input.svelte';
// import Toggles from '@components/system/inputs/toggles.svelte';

import { createWidget } from '@src/widgets/widget-factory';

// Type for aggregation field parameter
interface AggregationField {
	db_fieldName: string;
	[key: string]: unknown;
}

// ParaglideJS
import { widget_checkbox_description } from '@src/paraglide/messages';
import { boolean, type InferInput as ValibotInput } from 'valibot';
import type { CheckboxProps } from './types';

// Define the validation schema for the data this widget stores.
const CHECKBOX_VALIDATION_SCHEMA = boolean('Must be a boolean.');

// Create the widget definition using the factory.
const CheckboxWidget = createWidget<CheckboxProps>({
	Name: 'Checkbox',
	Icon: 'tabler:checkbox',
	Description: widget_checkbox_description(),

	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/Checkbox/Input.svelte',
	displayComponentPath: '/src/widgets/core/Checkbox/Display.svelte',

	// Assign the validation schema.
	validationSchema: CHECKBOX_VALIDATION_SCHEMA,

	// Set widget-specific defaults.
	defaults: {
		color: 'primary',
		size: 'md',
		translated: false // A simple boolean is typically not translated.
	},

	// Pass the GuiSchema directly into the widget's definition.
	GuiSchema: {
		label: { widget: 'Input', required: true },
		db_fieldName: { widget: 'Input', required: false },
		required: { widget: 'Toggles', required: false },
		icon: { widget: 'IconifyIconsPicker', required: false },
		helper: { widget: 'Input', required: false },
		width: { widget: 'Input', required: false },
		permissions: { widget: 'PermissionsSetting', required: false }
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
export type CheckboxWidgetData = ValibotInput<typeof CHECKBOX_VALIDATION_SCHEMA>;
