/**
 * @file tests/bun/utils/dateUtils.test.ts
 * @description Tests for date utility functions
 */

import { describe, expect, it } from 'bun:test';
import {
	dateToISODateString,
	formatDisplayDate,
	formatRelativeDate,
	isISODateString,
	isoDateStringToDate,
	normalizeDateInput,
	nowISODateString,
	stringToISODateString,
	toISOString
} from '@src/utils/date-utils';

describe('Date Utils - Type Guards', () => {
	it('should validate ISO date strings', () => {
		expect(isISODateString('2025-01-20T12:00:00.000Z')).toBe(true);
		expect(isISODateString('2025-01-20')).toBe(false);
		expect(isISODateString('invalid')).toBe(false);
		expect(isISODateString(123)).toBe(false);
		expect(isISODateString(null)).toBe(false);
	});

	it('should convert Date to ISO date string', () => {
		const date = new Date('2025-01-20T12:00:00.000Z');
		const result = dateToISODateString(date);

		expect(result).toBe('2025-01-20T12:00:00.000Z' as any);
		expect(isISODateString(result)).toBe(true);
	});

	it('should convert string to ISO date string', () => {
		const result = stringToISODateString('2025-01-20T12:00:00.000Z');

		expect(result).toBe('2025-01-20T12:00:00.000Z' as any);
		expect(isISODateString(result)).toBe(true);
	});

	it('should handle invalid date strings', () => {
		expect(() => stringToISODateString('invalid')).toThrow();
	});
});

describe('Date Utils - Conversions', () => {
	it('should convert various inputs to ISO string', () => {
		const date = new Date('2025-01-20T12:00:00.000Z');

		// Date object
		expect(toISOString(date)).toBe('2025-01-20T12:00:00.000Z' as any);

		// ISO string
		expect(toISOString('2025-01-20T12:00:00.000Z' as any)).toBe('2025-01-20T12:00:00.000Z' as any);

		// Timestamp
		expect(toISOString(date.getTime())).toBe('2025-01-20T12:00:00.000Z' as any);
	});

	it('should normalize date inputs', () => {
		const date = new Date('2025-01-20T12:00:00.000Z');

		expect(normalizeDateInput(date)).toBe('2025-01-20T12:00:00.000Z' as any);
		expect(normalizeDateInput('2025-01-20T12:00:00.000Z' as any)).toBe('2025-01-20T12:00:00.000Z' as any);
		expect(normalizeDateInput(date.getTime())).toBe('2025-01-20T12:00:00.000Z' as any);
	});

	it('should get current time as ISO string', () => {
		const now = nowISODateString();

		expect(isISODateString(now)).toBe(true);
		expect(typeof now).toBe('string');
	});

	it('should convert ISO string back to Date', () => {
		const isoString = '2025-01-20T12:00:00.000Z' as any;
		const date = isoDateStringToDate(isoString);

		expect(date instanceof Date).toBe(true);
		expect(date.toISOString()).toBe(isoString);
	});
});

describe('Date Utils - Formatting', () => {
	it('should format display date with default options', () => {
		const date = new Date('2025-01-20T12:00:00.000Z');
		const formatted = formatDisplayDate(date);

		expect(typeof formatted).toBe('string');
		expect(formatted.length).toBeGreaterThan(0);
	});

	it('should format display date with locale', () => {
		const date = new Date('2025-01-20T12:00:00.000Z');

		const enFormatted = formatDisplayDate(date, 'en');
		const deFormatted = formatDisplayDate(date, 'de');

		expect(enFormatted).not.toBe(deFormatted);
	});

	it('should format display date with custom options', () => {
		const date = new Date('2025-01-20T12:00:00.000Z');
		const formatted = formatDisplayDate(date, 'en', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});

		expect(formatted).toContain('2025');
		expect(formatted).toContain('January');
	});

	it('should format relative dates', () => {
		const now = new Date();

		// Just now
		expect(formatRelativeDate(now)).toContain('now');

		// 5 minutes ago
		const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
		const relative = formatRelativeDate(fiveMinutesAgo);
		expect(typeof relative).toBe('string');
	});

	it('should handle timestamp inputs in formatting', () => {
		const timestamp = Date.now();
		const formatted = formatDisplayDate(timestamp);

		expect(typeof formatted).toBe('string');
		expect(formatted.length).toBeGreaterThan(0);
	});

	it('should handle string inputs in formatting', () => {
		const dateString = '2025-01-20T12:00:00.000Z';
		const formatted = formatDisplayDate(dateString);

		expect(typeof formatted).toBe('string');
		expect(formatted.length).toBeGreaterThan(0);
	});
});

describe('Date Utils - Edge Cases', () => {
	it('should handle leap year dates', () => {
		const leapDate = new Date('2024-02-29T00:00:00.000Z');
		const isoString = dateToISODateString(leapDate);

		expect(isoString).toBe('2024-02-29T00:00:00.000Z' as any);
	});

	it('should handle timezone-aware conversions', () => {
		const date = new Date('2025-01-20T12:00:00.000Z');
		const isoString = dateToISODateString(date);

		// Should always return UTC
		expect(isoString).toContain('Z');
	});

	it('should handle Unix epoch', () => {
		const epoch = new Date(0);
		const isoString = dateToISODateString(epoch);

		expect(isoString).toBe('1970-01-01T00:00:00.000Z' as any);
	});

	it('should handle far future dates', () => {
		const futureDate = new Date('2099-12-31T23:59:59.999Z');
		const isoString = dateToISODateString(futureDate);

		expect(isoString).toBe('2099-12-31T23:59:59.999Z' as any);
	});
});
