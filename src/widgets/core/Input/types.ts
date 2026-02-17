/**
 * @file src/widgets/core/Input/types.ts
 * @description Type definitions for the Input widget (Text-only)
 *
 * @features
 * - **Strongly Typed**: Defines specific properties for a text input.
 * - **Text-Focused**: Specialized for text content only.
 * - **Extensible**: Can be easily expanded with more text-related options.
 */

export interface InputProps {
	// Character counting
	count?: number;

	// The maximum allowed length for text content.
	maxLength?: number;

	// Text constraints
	// The minimum allowed length for text content.
	minLength?: number;
	// Basic UI
	placeholder?: string;

	// Prefix/Suffix text
	prefix?: string;
	suffix?: string;

	// Index signature for WidgetProps constraint
	[key: string]: unknown;
}
