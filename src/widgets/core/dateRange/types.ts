/**
 * @file src/widgets/core/daterange/types.ts
 * @description Type definitions for the DateRange widget.
 */

/**
 * Defines the properties unique to the DateRange widget.
 */
export interface DateRangeProps {
	/**
	 * Display format for the date range
	 * @default 'medium'
	 */
	displayFormat?: 'short' | 'medium' | 'long' | 'full';

	/**
	 * Allow additional widget properties
	 */
	[key: string]: unknown;
}
