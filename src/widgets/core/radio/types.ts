/**
 * @file src/widgets/core/radio/types.ts
 * @description Type definitions for the Radio widget.
 *
 * @features
 * - **Strongly Typed**: Defines a clear structure for the radio button options.
 * - **Flexible Options**: Supports both string and number values for storage.
 */

// Defines a single option for the radio group.
interface RadioOption {
	label: string;
	value: string | number;
}

// Defines the properties unique to the Radio widget, configured in the collection builder.
export interface RadioProps {
	// An array of options to be displayed as radio buttons
	options: RadioOption[];
	// Legend text for the radio group
	legend?: string;
}
