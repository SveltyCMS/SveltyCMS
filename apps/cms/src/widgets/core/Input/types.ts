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
	// Basic UI
	placeholder?: string;

	// Prefix/Suffix text
	prefix?: string;
	suffix?: string;

	// Character counting
	count?: number;

	// Text constraints
	// The minimum allowed length for text content.
	minLength?: number;

	// The maximum allowed length for text content.
	maxLength?: number;

	// Index signature for WidgetProps constraint
	[key: string]: unknown;
}
