/**
 * @file src/widgets/core/Date/types.ts
 * @description Type definitions for the Date widget
 */

// Defines the properties unique to the Date widget
export interface DateProps {
	// Minimum allowed date (ISO 8601 string or Date object)
	minDate?: string | Date;

	// Maximum allowed date (ISO 8601 string or Date object)
	maxDate?: string | Date;

	// Display format for the date @default 'medium'
	displayFormat?: 'short' | 'medium' | 'long' | 'full';

	// Allow additional widget properties
	[key: string]: unknown;
}
