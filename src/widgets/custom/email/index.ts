/**
 * @file src/widgets/custom/email/index.ts
 * @description Email Widget Definition.
 *
 * Implements a robust email input widget using the Three Pillars Architecture.
 *
 * @features
 * - **Email Validation**: Uses Valibot's `email()` validator for strong format checking.
 * - **Simple Data Contract**: Stores a single, clean email string.
 * - **Non-Translatable**: Correctly treats email addresses as universal, non-translatable data.
 * - **Configurable GUI**: `GuiSchema` allows for easy setup in the Collection Builder.
 */

// Import components needed for the GuiSchema
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

import type { FieldInstance } from '@src/content/types';
import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/factory';
import { email, minLength, optional, pipe, string, type InferInput as ValibotInput } from 'valibot';
import type { EmailProps } from './types';

// The validation schema is a function to create rules based on the field config.
const validationSchema = (field: FieldInstance) => {
	// Start with a base string schema that requires a valid email format.
	let schema = pipe(string(), email('Please enter a valid email address.'));

	// If the field is required, also ensure it's not empty.
	if (field.required) {
		schema = pipe(string(), minLength(1, 'This field is required.'), email('Please enter a valid email address.'));
	}

	// If not required, wrap the schema to allow it to be optional.
	return field.required ? schema : optional(schema, '');
};

// Create the widget definition using the factory.
const EmailWidget = createWidget<EmailProps, ReturnType<typeof validationSchema>>({
	Name: 'Email',
	Icon: 'ic:outline-email',
	Description: m.widget_email_description(),
	inputComponentPath: '/src/widgets/custom/email/Input.svelte',
	displayComponentPath: '/src/widgets/custom/email/Display.svelte',
	validationSchema,

	// Set widget-specific defaults.
	defaults: {
		translated: false // An email address should not be translatable.
	},

	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		placeholder: { widget: Input, required: false }
	}
});

export default EmailWidget;

// Export helper types.
export type FieldType = ReturnType<typeof EmailWidget>;
export type EmailWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
