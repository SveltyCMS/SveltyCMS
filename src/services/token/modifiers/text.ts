/**
 * @file src/services/token/modifiers/text.ts
 * @description Text manipulation modifiers
 */

import type { ModifierFunction } from '../types';

/**
 * Converts text to uppercase
 */
export const upper: ModifierFunction = (value: unknown): string => {
	return String(value).toUpperCase();
};

/**
 * Converts text to lowercase
 */
export const lower: ModifierFunction = (value: unknown): string => {
	return String(value).toLowerCase();
};

/**
 * Capitalizes the first letter of each word
 */
export const capitalize: ModifierFunction = (value: unknown): string => {
	const str = String(value);
	return str
		.split(' ')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(' ');
};

/**
 * Truncates text to a specified length
 */
export const truncate: ModifierFunction = (value: unknown, params?: string[]): string => {
	const str = String(value);
	const length = params && params[0] ? parseInt(params[0], 10) : 50;
	const suffix = params && params[1] ? params[1] : '...';

	if (isNaN(length) || length < 0) {
		return str;
	}

	if (str.length <= length) {
		return str;
	}

	return str.substring(0, length) + suffix;
};

/**
 * Converts text to a URL-friendly slug
 */
export const slugify: ModifierFunction = (value: unknown): string => {
	const str = String(value);
	return str
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '') // Remove special characters
		.replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
		.replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

/**
 * Text modifiers array for registration
 */
export const textModifiers: Array<{ name: string; fn: ModifierFunction }> = [
	{ name: 'upper', fn: upper },
	{ name: 'lower', fn: lower },
	{ name: 'capitalize', fn: capitalize },
	{ name: 'truncate', fn: truncate },
	{ name: 'slugify', fn: slugify }
];

