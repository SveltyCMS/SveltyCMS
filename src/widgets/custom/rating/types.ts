/**
 * @file src/widgets/custom/rating/types.ts
 * @description Type definitions for the Rating widget.
 *
 * @features
 * - **Strongly Typed**: Defines clear configuration options for a rating input.
 * - **Customizable Icons**: Allows for custom icons for different rating states.
 */

// Defines the properties unique to the Rating widget, configured in the collection builder
export interface RatingProps {
	// The maximum rating value (e.g., number of stars) @default 5
	max?: number;

	// The icon to use for a full star @default 'material-symbols:star'
	iconFull?: string;

	// The icon to use for an empty star @default 'material-symbols:star-outline'
	iconEmpty?: string;

	// Index signature to satisfy WidgetProps constraint
	[key: string]: unknown;
}
