/**
 * @file apps/cms/src/widgets/core/Checkbox/types.ts
 * @description Type definitions for the Checkbox widget.
 */

/**
 * Defines the properties unique to the Checkbox widget.
 */
export interface CheckboxProps {
	/**
	 * Sets the color of the checkbox.
	 * @default 'primary'
	 */
	color?: 'primary' | 'secondary' | 'accent';
	/**
	 * Sets the size of the checkbox.
	 * @default 'md'
	 */
	size?: 'sm' | 'md' | 'lg';

	// Allow additional widget properties
	[key: string]: unknown;

	// Legend text for the Checkbox
	legend?: string;
}
