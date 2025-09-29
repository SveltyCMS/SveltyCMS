/**
 * @file src/widgets/core/text/types.ts
 * @description Type definitions for the Text widget
 *
 * @features
 * - **Strongly Typed**: Defines specific properties for a text input.
 * - **Extensible**: Can be easily expanded with more text-related options.
 */

// Defines the properties unique to the Text widget
// 'phone' is the canonical type for telephone-like inputs (tel/fax). Use 'phone' in field configs.
export type InputType = 'text' | 'email' | 'number' | 'phone' | 'url' | 'password';

export interface InputProps {
	// Basic UI
	placeholder?: string;

	// Prefix text
	prefix?: string;
	suffix?: string;
	count?: number;

	// Constraints
	/**
	 * The minimum allowed length for text OR the minimum numeric value when used with `inputType: 'number'`.
	 * For numbers the value is interpreted as the numeric minimum (e.g., minLength: 10 means >= 10).
	 */
	minLength?: number;

	/**
	 * The maximum allowed length for text OR the maximum numeric value when used with `inputType: 'number'`.
	 */
	maxLength?: number;

	// Number-specific
	// `step` remains available for numeric inputs to control step size.
	// For numeric bounds prefer `minLength`/`maxLength` which are used for both
	// text and number configuration to reduce duplication in collection configs.
	step?: number;

	// Phone-specific
	pattern?: string;

	// Which input type to render
	inputType?: InputType;

	// Index signature for WidgetProps constraint
	[key: string]: unknown;
}
