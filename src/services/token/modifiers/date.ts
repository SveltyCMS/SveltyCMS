/**
 * @file src/services/token/modifiers/date.ts
 * @description Date formatting modifiers
 */

import { format } from 'date-fns';
import type { ModifierFunction } from '../types';

/**
 * Formats a date using date-fns format
 * @param value Date value (string, Date, or number)
 * @param params Format string (default: 'yyyy-MM-dd')
 */
export const dateFormat: ModifierFunction = (value: unknown, params?: string[]): string => {
	if (!value) {
		return '';
	}

	let date: Date;

	// Convert value to Date
	if (value instanceof Date) {
		date = value;
	} else if (typeof value === 'string') {
		date = new Date(value);
	} else if (typeof value === 'number') {
		date = new Date(value);
	} else {
		return '';
	}

	// Check if date is valid
	if (isNaN(date.getTime())) {
		return '';
	}

	// Get format string (default: 'yyyy-MM-dd')
	const formatString = params && params[0] ? params[0] : 'yyyy-MM-dd';

	try {
		return format(date, formatString);
	} catch (error) {
		// If format string is invalid, return ISO string
		return date.toISOString();
	}
};

/**
 * Date modifiers array for registration
 */
export const dateModifiers: Array<{ name: string; fn: ModifierFunction }> = [
	{ name: 'date', fn: dateFormat }
];

