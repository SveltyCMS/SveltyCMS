/**
 * @file src/services/token/modifiers/date.ts
 * @description Date formatting modifiers
 */

import { formatDateString } from '@utils/dateUtils';
import type { ModifierFunction } from '../types';

/**
 * Formats a date using date-fns format string syntax
 * Uses centralized dateUtils.formatDateString for consistency
 * @param value Date value (string, Date, or number)
 * @param params Format string (default: 'yyyy-MM-dd')
 */
export const dateFormat: ModifierFunction = (value: unknown, params?: string[]): string => {
	if (!value) {
		return '';
	}

	// Get format string (default: 'yyyy-MM-dd')
	const formatString = params && params[0] ? params[0] : 'yyyy-MM-dd';

	// Use centralized dateUtils function
	return formatDateString(value as Date | number | string, formatString, '');
};

/**
 * Date modifiers array for registration
 */
export const dateModifiers: Array<{ name: string; fn: ModifierFunction }> = [
	{ name: 'date', fn: dateFormat }
];

