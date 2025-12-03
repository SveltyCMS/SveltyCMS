/**
 * @file src/widgets/custom/Email/index.ts
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
import { createWidget } from '@src/widgets/widgetFactory';
import { custom, email, minLength, optional, pipe, string, type InferInput as ValibotInput } from 'valibot';
import type { EmailProps } from './types';

// SECURITY: Common disposable email domains to block
const DISPOSABLE_DOMAINS = [
	'tempmail.com',
	'guerrillamail.com',
	'10minutemail.com',
	'mailinator.com',
	'throwaway.email',
	'yopmail.com',
	'temp-mail.org',
	'getnada.com'
];

const blockDisposableEmail = custom((input: unknown) => {
	if (typeof input !== 'string') return false;
	const domain = input.split('@')[1]?.toLowerCase();
	return !DISPOSABLE_DOMAINS.includes(domain);
}, 'Disposable email addresses are not allowed');

// The validation schema is a function to create rules based on the field config.
const validationSchema = (field: FieldInstance) => {
	// Start with a base string schema that requires a valid email format.
	const baseSchema = pipe(string(), email('Please enter a valid email address.'), blockDisposableEmail as any);

	// If the field is required, also ensure it's not empty.
	const schema = field.required
		? pipe(string(), minLength(1, 'This field is required.'), email('Please enter a valid email address.'), blockDisposableEmail as any)
		: baseSchema;

	// If not required, wrap the schema to allow it to be optional.
	return field.required ? schema : optional(schema, '');
};

// Create the widget definition using the factory.
const EmailWidget = createWidget<EmailProps>({
	Name: 'Email',
	Icon: 'ic:outline-email',
	Description: m.widget_email_description(),
	inputComponentPath: '/src/widgets/custom/Email/Input.svelte',
	displayComponentPath: '/src/widgets/custom/Email/Display.svelte',
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
	},

	// GraphQL schema for email input
	GraphqlSchema: () => ({
		typeID: 'String', // Use primitive String type
		graphql: '' // No custom type definition needed for primitives
	})
});

export default EmailWidget;

// Export helper types.
export type FieldType = ReturnType<typeof EmailWidget>;
export type EmailWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
