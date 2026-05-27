/**
 * @file src/widgets/core/Date/types.ts
 * @description Type definitions for the Date widget
 */

// Defines the properties unique to the Date widget
export interface DateProps {
	// Display format for the date @default 'medium'
	displayFormat?: 'short' | 'medium' | 'long' | 'full';

	// Maximum allowed date (ISO 8601 string or Date object)
	maxDate?: string | Date;
	// Minimum allowed date (ISO 8601 string or Date object)
	minDate?: string | Date;

	// Allow additional widget properties
	[key: string]: unknown;
}
