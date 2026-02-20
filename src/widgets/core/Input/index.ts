/**
 * @file src/widgets/core/Input/index.ts
 * @description Input Widget Definition - Text Input
 *
 * Implements a professional text input widget using the Three Pillars Architecture.
 * This widget is specialized for text content and supports full translation capabilities.
 *
 * @features
 * - **Text-Only**: Focused implementation for text content (use specialized widgets for email/phone/number)
 * - **Dynamic Validation**: Schema is generated based on `required`, `minLength`, `maxLength`, etc.
 * - **Configurable GUI**: `GuiSchema` allows easy configuration in the Collection Builder.
 * - **Translatable**: Fully supports multilingual content entry by default.
 * - **Database Aggregation**: Supports case-insensitive text search and sorting.
 * - **Character Counting**: Visual feedback for length constraints
 * - **Prefix/Suffix Support**: Flexible UI composition
 */

// Import components needed for the GuiSchema
// Import components needed for the GuiSchema
// import IconifyIconsPicker from '@components/iconify-icons-picker.svelte';
// import PermissionsSetting from '@components/permissions-setting.svelte';
// import Input from '@components/system/inputs/input.svelte';
// import Toggles from '@components/system/inputs/toggles.svelte';

import { widget_text_description } from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/widget-factory';

// Type for aggregation field parameter
interface AggregationField {
	db_fieldName: string;
	[key: string]: unknown;
}

import {
	type BaseIssue,
	type BaseSchema,
	maxLength,
	minLength,
	optional,
	pipe,
	record,
	string,
	transform,
	type InferInput as ValibotInput
} from 'valibot';
import type { InputProps } from './types';

// ✅ SSOT: Validation Schema - Exported for use in Input.svelte
export const createValidationSchema = (field: ReturnType<typeof InputWidget>): BaseSchema<unknown, unknown, BaseIssue<unknown>> => {
	// Build a string schema with text-specific rules
	const stringRules: unknown[] = [transform((s: string) => (typeof s === 'string' ? s.trim() : s))];

	if (field.required) {
		stringRules.push(minLength(1, 'This field is required.'));
	}
	if ((field as InputProps).minLength) {
		stringRules.push(minLength((field as InputProps).minLength as number, `Must be at least ${(field as InputProps).minLength} characters.`));
	}
	if ((field as InputProps).maxLength) {
		stringRules.push(maxLength((field as InputProps).maxLength as number, `Must be no more than ${(field as InputProps).maxLength} characters.`));
	}

	// Build the base string schema
	const schema: BaseSchema<unknown, unknown, BaseIssue<unknown>> = pipe(string(), ...(stringRules as unknown as []));

	// Translated fields store an object with language keys -> validate as flexible object
	if (field.translated) {
		return optional(record(string(), string()), {});
	}

	// If not required, allow optional empty value
	return field.required ? schema : optional(schema, '');
};

// Create the widget definition using the factory.
const InputWidget = createWidget<InputProps>({
	Name: 'Input',
	Icon: 'mdi:form-textbox',
	Description: widget_text_description(),
	inputComponentPath: '/src/widgets/core/Input/Input.svelte',
	displayComponentPath: '/src/widgets/core/Input/Display.svelte',

	validationSchema: createValidationSchema,

	// Set widget-specific defaults.
	defaults: {
		translated: true
	},

	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		label: { widget: 'Input', required: true },
		db_fieldName: { widget: 'Input', required: false },
		required: { widget: 'Toggles', required: false },
		translated: { widget: 'Toggles', required: false },
		icon: { widget: 'IconifyIconsPicker', required: false },
		helper: { widget: 'Input', required: false },
		width: { widget: 'Input', required: false },
		permissions: { widget: 'PermissionsSetting', required: false },
		placeholder: { widget: 'Input', required: false },
		minLength: { widget: 'Input', required: false },
		maxLength: { widget: 'Input', required: false },
		prefix: { widget: 'Input', required: false },
		suffix: { widget: 'Input', required: false },
		count: { widget: 'Input', required: false }
	},

	// Aggregations for text search and sorting.
	aggregations: {
		filters: async ({ field, filter, contentLanguage }: { field: AggregationField; filter: string; contentLanguage: string }) => [
			{
				$match: {
					[`${field.db_fieldName}.${contentLanguage}`]: {
						$regex: filter,
						$options: 'i'
					}
				}
			}
		],
		sorts: async ({ field, sortDirection, contentLanguage }: { field: AggregationField; sortDirection: number; contentLanguage: string }) => ({
			[`${field.db_fieldName}.${contentLanguage}`]: sortDirection
		})
	},

	// GraphQL schema for text input
	GraphqlSchema: () => ({
		typeID: 'String', // Use primitive String type
		graphql: '' // No custom type definition needed for primitives
	})
});

export default InputWidget;

// Export helper types.
export type FieldType = ReturnType<typeof InputWidget>;
export type InputWidgetData = ValibotInput<ReturnType<typeof createValidationSchema>>;
