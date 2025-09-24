/**
 * @file src/widgets/core/text/types.ts
 * @description Type definitions for the Text widget
 *
 * @features
 * - **Strongly Typed**: Defines specific properties for a text input.
 * - **Extensible**: Can be easily expanded with more text-related options.
 */

// Defines the properties unique to the Text widget
export interface TextProps {
	// Placeholder text for the input field
	placeholder?: string;
	// The minimum required length for the text
	minLength?: number;
	// The maximum allowed length for the text
	maxLength?: number;
}
