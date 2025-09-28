/**
 * @file src/widgets/core/datetime/types.ts
 * @description Type definitions for the DateTime widget.
 */

/**
 * Defines the properties unique to the DateTime widget.
 */
export interface DateTimeProps {
	/**
	 * Display format for the datetime
	 * @default 'medium'
	 */
	displayFormat?: 'short' | 'medium' | 'long' | 'full';

	/**
	 * Allow additional widget properties
	 */
	[key: string]: unknown;
}
