/**
 * @file apps/shared-utils/dateUtils.ts
 * @description Shared date utility functions for SveltyCMS
 * Provides type-safe date conversion and formatting utilities
 */

import type { ISODateString } from '@sveltycms/shared-config/types';

/**
 * Type guard for ISODateString
 */
export function isISODateString(value: unknown): value is ISODateString {
	if (typeof value !== 'string') return false;
	const date = new Date(value);
	return !isNaN(date.getTime()) && date.toISOString() === value;
}

/**
 * Convert Date to ISODateString with validation
 */
export function dateToISODateString(date: Date): ISODateString {
	const isoString = date.toISOString();
	if (!isISODateString(isoString)) {
		throw new Error('Invalid date conversion');
	}
	return isoString;
}

/**
 * Convert string to ISODateString with validation
 */
export function stringToISODateString(dateString: string): ISODateString {
	const date = new Date(dateString);
	if (isNaN(date.getTime())) {
		throw new Error('Invalid date string');
	}
	return dateToISODateString(date);
}

/**
 * Safe conversion of unknown value to ISODateString
 * Database-agnostic utility that handles various date representations
 */
export function toISOString(value: unknown): ISODateString {
	// Handle Date objects
	if (value && typeof value === 'object' && 'toISOString' in value) {
		return (value as Date).toISOString() as ISODateString;
	}
	// Handle already converted ISO strings
	if (typeof value === 'string' && isISODateString(value)) {
		return value;
	}
	// Handle timestamps or date strings
	if (value) {
		try {
			return new Date(value as string | number).toISOString() as ISODateString;
		} catch {
			console.warn('Failed to convert value to ISODateString, using current date', { value });
		}
	}
	// Fallback: current date
	return new Date().toISOString() as ISODateString;
}

/**
 * Validate and normalize date input
 * Accepts Date, ISODateString, number (timestamp), or string
 */
export function normalizeDateInput(dateInput: Date | ISODateString | number | string): ISODateString {
	if (!dateInput) return dateToISODateString(new Date());
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
		if (!isNaN(num)) {
			return dateToISODateString(new Date(num < 1e12 ? num * 1000 : num));
		}
		return dateToISODateString(new Date(dateInput));
	}
	return dateToISODateString(new Date());
}

/**
 * Current date as ISODateString
 */
export function nowISODateString(): ISODateString {
	return dateToISODateString(new Date());
}

/**
 * Convert ISODateString back to Date object
 */
export function isoDateStringToDate(isoDate: ISODateString): Date {
	return new Date(isoDate);
}

/**
 * Format date for display with proper locale and timezone handling
 */
export function formatDisplayDate(
	dateInput: Date | number | string,
	locale: string = 'en',
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
			date = new Date(dateInput > 1e12 ? dateInput : dateInput * 1000);
		} else if (typeof dateInput === 'string') {
			date = new Date(dateInput);
		} else {
			date = dateInput;
		}

		if (isNaN(date.getTime())) {
			return 'Invalid Date';
		}

		return new Intl.DateTimeFormat(locale, options).format(date);
	} catch (error) {
		console.error('Error formatting date:', error);
		return 'Invalid Date';
	}
}

/**
 * Format date in relative way (e.g. "2 hours ago")
 */
export function formatRelativeDate(dateInput: Date | number | string, locale: string = 'en'): string {
	try {
		let date: Date;

		if (typeof dateInput === 'number') {
			date = new Date(dateInput > 1e12 ? dateInput : dateInput * 1000);
		} else if (typeof dateInput === 'string') {
			date = new Date(dateInput);
		} else {
			date = dateInput;
		}

		if (isNaN(date.getTime())) {
			return 'Invalid Date';
		}

		const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
		const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

		if (seconds < 60) return formatter.format(-seconds, 'second');
		if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), 'minute');
		if (seconds < 86400) return formatter.format(-Math.floor(seconds / 3600), 'hour');
		if (seconds < 2592000) return formatter.format(-Math.floor(seconds / 86400), 'day');
		if (seconds < 31536000) return formatter.format(-Math.floor(seconds / 2592000), 'month');

		return formatter.format(-Math.floor(seconds / 31536000), 'year');
	} catch (error) {
		console.error('Error formatting relative date:', error);
		return 'Invalid Date';
	}
}
