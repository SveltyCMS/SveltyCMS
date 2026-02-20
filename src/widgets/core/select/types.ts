/**
 * @file src/widgets/core/select/types.ts
 * @description Type definitions for the Select widget.
 */

export interface SelectOption {
	label: string;
	value: string | number;
}

export interface SelectProps extends Record<string, any> {
	/** Optional color theme for the select component */
	color?: string;

	/** Default value if none is selected */
	default?: string | number;

	/** Placeholder text when no value is selected */
	placeholder?: string;

	/** Array of selectable options */
	options: (string | SelectOption)[];

	/** Whether the field is required */
	required?: boolean;

	/** Whether the field is translatable */
	translated?: boolean;
}
