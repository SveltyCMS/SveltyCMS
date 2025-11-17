/**
 * @file src/services/token/modifiers/logical.ts
 * @description Logical modifiers
 */

import type { ModifierFunction } from '../types';

/**
 * Provides a default value if the token is empty/null/undefined
 * @param value The token value
 * @param params Fallback value (default: '')
 */
export const defaultValue: ModifierFunction = (value: unknown, params?: string[]): string => {
	const fallback = params && params[0] ? params[0] : '';

	if (value === null || value === undefined || value === '') {
		return fallback;
	}

	return String(value);
};

/**
 * Logical modifiers array for registration
 */
export const logicalModifiers: Array<{ name: string; fn: ModifierFunction }> = [
	{ name: 'default', fn: defaultValue }
];

