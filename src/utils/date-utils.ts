/**
 * @file src/utils/dateUtils.ts
 * @description Date utility functions for SveltyCMS
 *
 * Provides:
 * - Type-safe conversion between Date objects and ISODateString
 * - Date validation utilities
 * - Consistent date handling across the application
 * - Database-agnostic date conversion helpers
 */

import { logger } from '@utils/logger';
import type { ISODateString } from '../content/types';

// Type guard for ISODateString
export function isISODateString(value: unknown): value is ISODateString {
	if (typeof value !== 'string') {
		return false;
	}
	const date = new Date(value);
	return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

// Convert Date to ISODateString with validation
export function dateToISODateString(date: Date): ISODateString {
	const isoString = date.toISOString();
	if (!isISODateString(isoString)) {
		throw new Error('Invalid date conversion');
	}
	return isoString;
}

// Convert string to ISODateString with validation
export function stringToISODateString(dateString: string): ISODateString {
	const date = new Date(dateString);
	if (Number.isNaN(date.getTime())) {
		throw new Error('Invalid date string');
	}
	return dateToISODateString(date);
}

/**
 * Safe conversion of unknown value to ISODateString
 * Database-agnostic utility that handles various date representations from any database adapter
 * (Mongoose Date objects, PostgreSQL timestamps, SQLite strings, etc.)
 *
 * @param value - Unknown value from database query (Date object, ISO string, timestamp, etc.)
 * @returns ISODateString representation
 *
 * @example
 * const doc = await db.collection.findById(id);
 * const entity = {
 *   createdAt: toISOString(doc.createdAt),
 *   updatedAt: toISOString(doc.updatedAt)
 * };
 */
export function toISOString(value: unknown): ISODateString {
	// Handle Date objects (common from ORMs and document databases)
	if (value && typeof value === 'object' && 'toISOString' in value) {
		return (value as Date).toISOString() as ISODateString;
	}
	// Handle already converted ISO strings (idempotent operation)
	if (typeof value === 'string' && isISODateString(value)) {
		return value;
	}
	// Handle timestamps or date strings
	if (value) {
		try {
			return new Date(value as string | number).toISOString() as ISODateString;
		} catch {
			logger.warn('Failed to convert value to ISODateString, using current date', { value });
		}
	}
	// Ultimate fallback: current date
	return new Date().toISOString() as ISODateString;
}

/**
 * Validate and normalize date input
 * Accepts Date, ISODateString, number (timestamp in seconds or ms), or string
 */
export function normalizeDateInput(dateInput: Date | ISODateString | number | string): ISODateString {
	if (!dateInput) {
		return dateToISODateString(new Date());
	}
	if (dateInput instanceof Date) {
		return dateToISODateString(dateInput);
	}
	if (typeof dateInput === 'number') {
		// If it's a 10-digit number, treat as seconds, else milliseconds
		return dateToISODateString(new Date(dateInput < 1e12 ? dateInput * 1000 : dateInput));
	}
	if (typeof dateInput === 'string') {
		// Try to parse as ISO string or number
		const num = Number(dateInput);
		if (!Number.isNaN(num)) {
			return dateToISODateString(new Date(num < 1e12 ? num * 1000 : num));
		}
		return dateToISODateString(new Date(dateInput));
	}
	return dateToISODateString(new Date());
}

// Current date as ISODateString
export function nowISODateString(): ISODateString {
	return dateToISODateString(new Date());
}

/**
 * Convert ISODateString back to Date object
 * @param isoDate The ISODateString to convert
 * @returns A Date object
 */
export function isoDateStringToDate(isoDate: ISODateString): Date {
	return new Date(isoDate);
}

/**
 * Format a date using a pattern string (e.g. "yyyy-MM-dd")
 * @param dateInput - Date, timestamp or ISO string
 * @param pattern - Format pattern
 * @param fallback - Fallback string if date is invalid
 */
export function formatDateString(dateInput: Date | number | string, pattern = 'yyyy-MM-dd', fallback = ''): string {
	try {
		let date: Date;

		if (typeof dateInput === 'number') {
			date = new Date(dateInput > 1e12 ? dateInput : dateInput * 1000);
		} else if (typeof dateInput === 'string') {
			date = new Date(dateInput);
		} else {
			date = dateInput;
		}

		if (Number.isNaN(date.getTime())) {
			return fallback;
		}

		const yyyy = date.getFullYear().toString();
		const MM = (date.getMonth() + 1).toString().padStart(2, '0');
		const dd = date.getDate().toString().padStart(2, '0');
		const HH = date.getHours().toString().padStart(2, '0');
		const mm = date.getMinutes().toString().padStart(2, '0');
		const ss = date.getSeconds().toString().padStart(2, '0');

		return pattern.replace('yyyy', yyyy).replace('MM', MM).replace('dd', dd).replace('HH', HH).replace('mm', mm).replace('ss', ss);
	} catch (error) {
		logger.error('Error formatting date string:', error);
		return fallback;
	}
}

/**
 * Format date for display with proper locale and timezone handling
 * @param dateInput - Date, timestamp or ISO string
 * @param locale - Locale to format for (default: system language)
 * @param options - Intl.DateTimeFormat options
 */
export function formatDisplayDate(
	dateInput: Date | number | string,
	locale = 'en',
	options: Intl.DateTimeFormatOptions = {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	}
): string {
	try {
		let date: Date;

		if (typeof dateInput === 'number') {
			// Handle MongoDB timestamp (seconds vs milliseconds)
			date = new Date(dateInput > 1e12 ? dateInput : dateInput * 1000);
		} else if (typeof dateInput === 'string') {
			date = new Date(dateInput);
		} else {
			date = dateInput;
		}

		if (Number.isNaN(date.getTime())) {
			return 'Invalid Date';
		}

		return new Intl.DateTimeFormat(locale, options).format(date);
	} catch (error) {
		logger.error('Error formatting date:', error);
		return 'Invalid Date';
	}
}

/**
 * Format date for display in a relative way (e.g. "2 hours ago")
 * @param dateInput - Date, timestamp or ISO string
 * @param locale - Locale to format for
 */
export function formatRelativeDate(dateInput: Date | number | string, locale = 'en'): string {
	try {
		let date: Date;

		if (typeof dateInput === 'number') {
			// Handle MongoDB timestamp (seconds vs milliseconds)
			date = new Date(dateInput > 1e12 ? dateInput : dateInput * 1000);
		} else if (typeof dateInput === 'string') {
			date = new Date(dateInput);
		} else {
			date = dateInput;
		}

		if (Number.isNaN(date.getTime())) {
			return 'Invalid Date';
		}

		const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
		const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

		if (seconds < 60) {
			return formatter.format(-seconds, 'second');
		}
		if (seconds < 3600) {
			return formatter.format(-Math.floor(seconds / 60), 'minute');
		}
		if (seconds < 86_400) {
			return formatter.format(-Math.floor(seconds / 3600), 'hour');
		}
		if (seconds < 2_592_000) {
			return formatter.format(-Math.floor(seconds / 86_400), 'day');
		}
		if (seconds < 31_536_000) {
			return formatter.format(-Math.floor(seconds / 2_592_000), 'month');
		}

		return formatter.format(-Math.floor(seconds / 31_536_000), 'year');
	} catch (error) {
		logger.error('Error formatting relative date:', error);
		return 'Invalid Date';
	}
}

/**
 * Utility to parse ISO 8601 duration (e.g., "PT3M20S") into a human-readable format (e.g., "3:20").
 * This function can be used in the Display component if the duration is stored in ISO format.
 */
export function formatIsoDuration(isoDuration: string | undefined): string | undefined {
	if (!isoDuration) {
		return undefined;
	}

	const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
	const matches = isoDuration.match(regex);

	if (!matches) {
		return undefined;
	}

	const hours = Number.parseInt(matches[1] || '0', 10);
	const minutes = Number.parseInt(matches[2] || '0', 10);
	const seconds = Number.parseInt(matches[3] || '0', 10);

	const parts: string[] = [];
	if (hours > 0) {
		parts.push(String(hours).padStart(2, '0'));
	}
	parts.push(String(minutes).padStart(2, '0'));
	parts.push(String(seconds).padStart(2, '0'));

	return parts.join(':');
}
