/**
 * @file src/widgets/core/input/index.ts
 * @description Input Widget Definition
 *
 * Implements a versatile text input widget using the Three Pillars Architecture.
 * This widget features a dynamic validation schema that adapts to the field's configuration.
 *
 * @features
 * - **Dynamic Validation**: Schema is generated based on `required`, `minLength`, etc.
 * - **Configurable GUI**: `GuiSchema` allows easy configuration in the Collection Builder.
 * - **Translatable**: Fully supports multilingual content entry by default.
 * - **Database Aggregation**: Supports case-insensitive text search and sorting.
 */

// Import components needed for the GuiSchema
import IconifyPicker from '@components/IconifyPicker.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/factory';
import {
	any,
	email,
	maxLength,
	maxValue,
	minLength,
	minValue,
	number as numberSchema,
	object,
	optional,
	pipe,
	regex,
	string,
	transform,
	type BaseIssue,
	type BaseSchema,
	type InferInput as ValibotInput
} from 'valibot';
import type { InputProps } from './types';

// The validation schema is a function that receives the field config and returns a schema.
const createValidationSchema = (field: ReturnType<typeof InputWidget>): BaseSchema<unknown, unknown, BaseIssue<unknown>> => {
	// Build a string schema first with common string rules
	const stringRules: Array<unknown> = [transform((s: string) => (typeof s === 'string' ? s.trim() : s))];

	if (field.required) stringRules.push(minLength(1, 'This field is required.'));
	if ((field as InputProps).minLength)
		stringRules.push(minLength((field as InputProps).minLength as number, `Must be at least ${(field as InputProps).minLength} characters.`));
	if ((field as InputProps).maxLength)
		stringRules.push(maxLength((field as InputProps).maxLength as number, `Must be no more than ${(field as InputProps).maxLength} characters.`));

	// Handle special input types
	if ((field as InputProps).inputType === 'email') {
		stringRules.push(email('Invalid email address.'));
	}

	if ((field as InputProps).inputType === 'phone') {
		// Default E.164 pattern unless a custom pattern is provided in field
		const defaultPattern = /^\+[1-9]\d{1,14}$/;
		const pattern = (field as InputProps).pattern ? new RegExp((field as InputProps).pattern as string) : defaultPattern;
		stringRules.push(regex(pattern, 'Invalid phone number format.'));
	}

	// Start with appropriate base schema depending on inputType
	let schema: BaseSchema<unknown, unknown, BaseIssue<unknown>> = pipe(string(), ...(stringRules as unknown as []));

	if ((field as InputProps).inputType === 'number') {
		const numberRules: Array<unknown> = [];
		// Use minLength/maxLength for numeric bounds to keep configuration uniform across text/number
		const minVal = field.minLength as number | undefined;
		const maxVal = field.maxLength as number | undefined;
		if (minVal !== undefined) numberRules.push(minValue(minVal, `Value must be at least ${minVal}.`));
		if (maxVal !== undefined) numberRules.push(maxValue(maxVal, `Value must not exceed ${maxVal}.`));
		schema = pipe(numberSchema(), ...(numberRules as unknown as []));
	}

	// Translated fields store an object with language keys -> validate as flexible object
	if (field.translated) {
		return object({ _any: any() });
	}

	// If not required, allow optional empty value
	return field.required ? schema : optional(schema, '');
};

// Create the widget definition using the factory.
const InputWidget = createWidget<InputProps>({
	Name: 'Input',
	Icon: 'mdi:form-textbox',
	Description: m.widget_text_description(),
	inputComponentPath: '/src/widgets/core/input/Input.svelte',
	displayComponentPath: '/src/widgets/core/input/Display.svelte',

	validationSchema: createValidationSchema,

	// Set widget-specific defaults.
	defaults: {
		translated: true
	},

	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		translated: { widget: Toggles, required: false },
		icon: { widget: IconifyPicker, required: false },
		helper: { widget: Input, required: false },
		width: { widget: Input, required: false },
		permissions: { widget: PermissionsSetting, required: false },
		placeholder: { widget: Input, required: false },
		minLength: { widget: Input, required: false },
		maxLength: { widget: Input, required: false },
		prefix: { widget: Input, required: false },
		suffix: { widget: Input, required: false },
		count: { widget: Input, required: false }
	},

	// Aggregations for text search and sorting.
	aggregations: {
		filters: async ({ field, filter, contentLanguage }) => [
			{ $match: { [`${field.db_fieldName}.${contentLanguage}`]: { $regex: filter, $options: 'i' } } }
		],
		sorts: async ({ field, sortDirection, contentLanguage }) => ({
			[`${field.db_fieldName}.${contentLanguage}`]: sortDirection
		})
	}
});

export default InputWidget;

// Export helper types.
export type FieldType = ReturnType<typeof InputWidget>;
export type InputWidgetData = ValibotInput<ReturnType<typeof createValidationSchema>>;
