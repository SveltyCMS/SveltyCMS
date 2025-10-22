/**
 * @file src/widgets/custom/phonenumber/index.ts
 * @description PhoneNumber Widget Definition.
 *
 * Implements a robust phone number input that stores a simple string.
 *
 * @features
 * - **Dynamic Validation**: Uses a custom `pattern` if provided, otherwise defaults to E.164 international format.
 * - **Semantic HTML**: The input component uses `<input type="tel">` for accessibility.
 * - **Actionable Display**: The display component renders a clickable `tel:` link.
 * - **Configurable GUI**: `GuiSchema` allows for easy setup in the Collection Builder.
 */

// Import components needed for the GuiSchema
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

import type { FieldInstance } from '@src/content/types';
import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/factory';
import { minLength, optional, pipe, regex, string, type InferInput as ValibotInput } from 'valibot';
import type { PhoneNumberProps } from './types';

// The validation schema is a function to create rules based on the field config.
const validationSchema = (field: FieldInstance) => {
	// A robust default regex for international E.164 format (e.g., +491234567).
	const defaultPattern = /^\+[1-9]\d{1,14}$/;
	const validationMessage = 'Please enter a valid phone number format.';

	// Use the custom pattern from the field config, or fall back to the default.
	const validationPattern = field.pattern ? new RegExp(field.pattern as string) : defaultPattern;

	// Start with a base string schema that includes the regex validation.
	const baseSchema = pipe(string(), regex(validationPattern, validationMessage));

	// If the field is required, also ensure it's not empty.
	const schema = field.required ? pipe(string(), minLength(1, 'This field is required.'), regex(validationPattern, validationMessage)) : baseSchema;

	// If not required, wrap the schema to allow it to be optional.
	return field.required ? schema : optional(schema, '');
};

// Create the widget definition using the factory.
const PhoneNumberWidget = createWidget<PhoneNumberProps>({
	Name: 'PhoneNumber',
	Icon: 'ic:baseline-phone-in-talk',
	Description: m.widget_phoneNumber_description(),
	inputComponentPath: '/src/widgets/custom/phonenumber/Input.svelte',
	displayComponentPath: '/src/widgets/custom/phonenumber/Display.svelte',
	validationSchema,

	// Set widget-specific defaults.
	defaults: {
		translated: false // A phone number should not be translatable.
	},

	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		placeholder: { widget: Input, required: false },
		pattern: { widget: Input, required: false, helper: 'Optional: Custom regex for validation.' }
	}
});

export default PhoneNumberWidget;

// Export helper types.
export type FieldType = ReturnType<typeof PhoneNumberWidget>;
export type PhoneNumberWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
