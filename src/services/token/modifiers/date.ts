/**
 * @file src/services/token/modifiers/date.ts
 * @description Date formatting modifiers with preset formats
 * 
 * The date modifier supports both custom format strings and preset names.
 * 
 * Preset formats:
 * - 'iso' or 'iso8601' - ISO 8601 format: 2024-01-15T10:30:00.000Z
 * - 'date' - Date only: 2024-01-15
 * - 'time' - Time only: 10:30:00
 * - 'datetime' - Date and time: 2024-01-15 10:30:00
 * - 'short' - Short date: 1/15/2024
 * - 'long' - Long date: January 15, 2024
 * - 'full' - Full date and time: Monday, January 15, 2024 at 10:30 AM
 * - 'relative' - Relative time: "2 hours ago", "in 3 days"
 * - 'timestamp' - Unix timestamp: 1705312200
 * 
 * Custom format strings use date-fns format tokens:
 * - yyyy - 4-digit year
 * - MM - 2-digit month (01-12)
 * - dd - 2-digit day (01-31)
 * - HH - 24-hour format (00-23)
 * - mm - minutes (00-59)
 * - ss - seconds (00-59)
 * 
 * Examples:
 * - {{entry.created | date}} - Default: 2024-01-15
 * - {{entry.created | date("iso")}} - ISO format
 * - {{entry.created | date("yyyy-MM-dd HH:mm")}} - Custom format
 * - {{entry.created | date("relative")}} - Relative time
 */

import { format, formatDistanceToNow } from 'date-fns';
import type { ModifierFunction } from '../types';

/**
 * Preset format mappings
 */
const PRESET_FORMATS: Record<string, string> = {
	iso: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
	iso8601: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
	date: 'yyyy-MM-dd',
	time: 'HH:mm:ss',
	datetime: 'yyyy-MM-dd HH:mm:ss',
	short: 'M/d/yyyy',
	long: 'MMMM d, yyyy',
	full: "EEEE, MMMM d, yyyy 'at' h:mm a",
	timestamp: 'timestamp' // Special case
};

/**
 * Formats a date using date-fns format or preset
 * @param value Date value (string, Date, or number)
 * @param params Format preset name or custom format string (default: 'date')
 * 
 * @example {{entry.created | date}} - Returns: 2024-01-15
 * @example {{entry.created | date("iso")}} - Returns: 2024-01-15T10:30:00.000Z
 * @example {{entry.created | date("yyyy-MM-dd HH:mm")}} - Returns: 2024-01-15 10:30
 * @example {{entry.created | date("relative")}} - Returns: "2 hours ago"
 * @example {{entry.created | date("timestamp")}} - Returns: 1705312200
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

	// Get format string or preset (default: 'date')
	const formatParam = params && params[0] ? params[0].toLowerCase() : 'date';

	// Handle special cases
	if (formatParam === 'timestamp') {
		return String(Math.floor(date.getTime() / 1000));
	}

	if (formatParam === 'relative') {
		try {
			return formatDistanceToNow(date, { addSuffix: true });
		} catch {
			return date.toISOString();
		}
	}

	// Get format string (check preset first, then use as-is)
	const formatString = PRESET_FORMATS[formatParam] || formatParam;

	try {
		return format(date, formatString);
	} catch (error) {
		// If format string is invalid, try preset or return ISO string
		if (PRESET_FORMATS[formatParam]) {
			return date.toISOString();
		}
		// Try default format
		try {
			return format(date, 'yyyy-MM-dd');
		} catch {
			return date.toISOString();
		}
	}
};

/**
 * Date modifiers array for registration
 */
export const dateModifiers: Array<{ name: string; fn: ModifierFunction }> = [
	{ name: 'date', fn: dateFormat }
];

