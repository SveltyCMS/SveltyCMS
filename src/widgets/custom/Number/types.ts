/**
 * @file src/widgets/custom/Number/types.ts
 * @description Type definitions for the Number widget.
 *
 * @features
 * - **Strongly Typed**: Defines clear configuration options for numeric inputs.
 * - **Precise Control**: Includes `min`, `max`, and `step` for fine-grained control.
 */

// Defines the properties unique to the Number widget, configured in the collection builder
export interface NumberProps {
	// The maximum allowed value
	max?: number;
	// The minimum allowed value
	min?: number;

	// A placeholder for the input field
	placeholder?: string;

	// The stepping interval for the input arrows @default 1
	step?: number;

	// Index signature to satisfy WidgetProps constraint
	[key: string]: unknown;
}
