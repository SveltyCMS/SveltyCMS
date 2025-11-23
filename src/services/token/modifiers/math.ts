/**
 * @file src/services/token/modifiers/math.ts
 * @description Mathematical operation modifiers
 */

import type { ModifierFunction } from '../types';

/**
 * Adds a number to the value
 * @param value Numeric value
 * @param params Number to add (default: 0)
 * @example {{entry.price | add(10)}} - Adds 10 to entry.price
 */
export const add: ModifierFunction = (value: unknown, params?: string[]): string => {
	const num = parseFloat(String(value));
	if (isNaN(num)) return String(value);
	const addend = params && params[0] ? parseFloat(params[0]) : 0;
	if (isNaN(addend)) return String(value);
	return String(num + addend);
};

/**
 * Subtracts a number from the value
 * @param value Numeric value
 * @param params Number to subtract (default: 0)
 * @example {{entry.price | subtract(5)}} - Subtracts 5 from entry.price
 */
export const subtract: ModifierFunction = (value: unknown, params?: string[]): string => {
	const num = parseFloat(String(value));
	if (isNaN(num)) return String(value);
	const subtrahend = params && params[0] ? parseFloat(params[0]) : 0;
	if (isNaN(subtrahend)) return String(value);
	return String(num - subtrahend);
};

/**
 * Multiplies the value by a number
 * @param value Numeric value
 * @param params Multiplier (default: 1)
 * @example {{entry.price | multiply(1.2)}} - Multiplies entry.price by 1.2 (20% increase)
 */
export const multiply: ModifierFunction = (value: unknown, params?: string[]): string => {
	const num = parseFloat(String(value));
	if (isNaN(num)) return String(value);
	const multiplier = params && params[0] ? parseFloat(params[0]) : 1;
	if (isNaN(multiplier)) return String(value);
	return String(num * multiplier);
};

/**
 * Divides the value by a number
 * @param value Numeric value
 * @param params Divisor (default: 1)
 * @example {{entry.total | divide(2)}} - Divides entry.total by 2
 */
export const divide: ModifierFunction = (value: unknown, params?: string[]): string => {
	const num = parseFloat(String(value));
	if (isNaN(num)) return String(value);
	const divisor = params && params[0] ? parseFloat(params[0]) : 1;
	if (isNaN(divisor) || divisor === 0) return String(value);
	return String(num / divisor);
};

/**
 * Rounds the value to the nearest integer
 * @param value Numeric value
 * @param params Optional: number of decimal places (default: 0)
 * @example {{entry.price | round}} - Rounds to nearest integer
 * @example {{entry.price | round(2)}} - Rounds to 2 decimal places
 */
export const round: ModifierFunction = (value: unknown, params?: string[]): string => {
	const num = parseFloat(String(value));
	if (isNaN(num)) return String(value);
	const decimals = params && params[0] ? parseInt(params[0], 10) : 0;
	if (isNaN(decimals) || decimals < 0) return String(Math.round(num));
	const factor = Math.pow(10, decimals);
	return String(Math.round(num * factor) / factor);
};

/**
 * Rounds up to the nearest integer (ceiling)
 * @param value Numeric value
 * @example {{entry.price | ceil}} - Rounds up to nearest integer
 */
export const ceil: ModifierFunction = (value: unknown): string => {
	const num = parseFloat(String(value));
	if (isNaN(num)) return String(value);
	return String(Math.ceil(num));
};

/**
 * Rounds down to the nearest integer (floor)
 * @param value Numeric value
 * @example {{entry.price | floor}} - Rounds down to nearest integer
 */
export const floor: ModifierFunction = (value: unknown): string => {
	const num = parseFloat(String(value));
	if (isNaN(num)) return String(value);
	return String(Math.floor(num));
};

/**
 * Returns the absolute value
 * @param value Numeric value
 * @example {{entry.difference | abs}} - Returns absolute value
 */
export const abs: ModifierFunction = (value: unknown): string => {
	const num = parseFloat(String(value));
	if (isNaN(num)) return String(value);
	return String(Math.abs(num));
};

/**
 * Returns the minimum value between the token value and a parameter
 * @param value Numeric value
 * @param params Maximum value
 * @example {{entry.price | min(100)}} - Returns the smaller of entry.price or 100
 */
export const min: ModifierFunction = (value: unknown, params?: string[]): string => {
	const num = parseFloat(String(value));
	if (isNaN(num)) return String(value);
	if (!params || !params[0]) return String(value);
	const maxVal = parseFloat(params[0]);
	if (isNaN(maxVal)) return String(value);
	return String(Math.min(num, maxVal));
};

/**
 * Returns the maximum value between the token value and a parameter
 * @param value Numeric value
 * @param params Minimum value
 * @example {{entry.price | max(10)}} - Returns the larger of entry.price or 10
 */
export const max: ModifierFunction = (value: unknown, params?: string[]): string => {
	const num = parseFloat(String(value));
	if (isNaN(num)) return String(value);
	if (!params || !params[0]) return String(value);
	const minVal = parseFloat(params[0]);
	if (isNaN(minVal)) return String(value);
	return String(Math.max(num, minVal));
};

/**
 * Formats a number with thousand separators
 * @param value Numeric value
 * @param params Optional: number of decimal places (default: 0)
 * @example {{entry.price | number}} - Formats as number with commas
 * @example {{entry.price | number(2)}} - Formats with 2 decimal places
 */
export const number: ModifierFunction = (value: unknown, params?: string[]): string => {
	const num = parseFloat(String(value));
	if (isNaN(num)) return String(value);
	const decimals = params && params[0] ? parseInt(params[0], 10) : 0;
	if (isNaN(decimals) || decimals < 0) {
		return num.toLocaleString();
	}
	return num.toLocaleString(undefined, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals
	});
};

/**
 * Math modifiers array for registration
 */
export const mathModifiers: Array<{ name: string; fn: ModifierFunction }> = [
	{ name: 'add', fn: add },
	{ name: 'subtract', fn: subtract },
	{ name: 'multiply', fn: multiply },
	{ name: 'divide', fn: divide },
	{ name: 'round', fn: round },
	{ name: 'ceil', fn: ceil },
	{ name: 'floor', fn: floor },
	{ name: 'abs', fn: abs },
	{ name: 'min', fn: min },
	{ name: 'max', fn: max },
	{ name: 'number', fn: number }
];

