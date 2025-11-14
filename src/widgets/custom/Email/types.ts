/**
 * @file src/widgets/custom/email/types.ts
 * @description Type definitions for the Email widget.
 *
 * @features
 * - **Strongly Typed**: Defines specific properties for an email input field.
 */

// Defines the properties unique to the Email widget, configured in the collection builder
export interface EmailProps {
	// Placeholder text for the input field
	placeholder?: string;

	// Index signature to satisfy WidgetProps constraint
	[key: string]: unknown;
}
