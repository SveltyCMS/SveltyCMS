/**
 * @file src/databases/mariadb/utils.ts
 * @description Utility functions for MariaDB adapter
 *
 * Features:
 * - Generate a new UUID v4 for database IDs
 * - Validate a DatabaseId (UUID v4)
 * - Convert Date to ISODateString
 * - Convert ISODateString to Date
 * - Create a DatabaseError object
 * - Normalize path by removing leading/trailing slashes and deduplicating slashes
 * - Apply tenant filter to WHERE conditions
 * - Convert MySQL row dates to ISO strings
 * - Convert array of MySQL rows dates to ISO strings
 * - Create a paginated result from an array of items (in-memory)
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseError, DatabaseId, ISODateString, PaginatedResult, PaginationOptions } from '../dbInterface';

// Generate a new compact, dash-less UUID v4 for database IDs
export function generateId(): DatabaseId {
	return uuidv4().replace(/-/g, '') as DatabaseId;
}

// Validate a DatabaseId (UUID v4, with or without dashes)
export function validateId(id: string): boolean {
	const uuidRegex = /^([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
	return uuidRegex.test(id);
}

// Convert Date to ISODateString
export function dateToISO(date: Date | null | undefined): ISODateString | undefined {
	if (!date) {
		return undefined;
	}
	return date.toISOString() as ISODateString;
}

// Convert ISODateString to Date
export function isoToDate(iso: ISODateString | null | undefined): Date | undefined {
	if (!iso) {
		return undefined;
	}
	return new Date(iso);
}

// Create a DatabaseError object
export function createDatabaseError(code: string, message: string, details?: unknown, statusCode?: number): DatabaseError {
	return {
		code,
		message,
		statusCode,
		details
	};
}

// Normalize path by removing leading/trailing slashes and deduplicating slashes
export function normalizePath(path: string): string {
	return path
		.replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
		.replace(/\/+/g, '/'); // Deduplicate slashes
}

// Apply tenant filter to WHERE conditions
export function applyTenantFilter<T extends Record<string, unknown>>(conditions: T, tenantId?: string): T & { tenantId?: string | null } {
	if (tenantId) {
		return { ...conditions, tenantId };
	}
	return conditions;
}

/**
 * Convert MySQL row dates to ISO strings
 * This ensures all date fields are properly formatted as ISODateString
 */
export function convertDatesToISO<T extends Record<string, unknown>>(row: T): T {
	const result = { ...row };

	for (const key in result) {
		if (!Object.hasOwn(result, key)) {
			continue;
		}
		const value = result[key];
		if (value instanceof Date) {
			(result as Record<string, unknown>)[key] = value.toISOString() as ISODateString;
		}
	}

	return result;
}

// Convert array of MySQL rows dates to ISO strings
export function convertArrayDatesToISO<T extends Record<string, unknown>>(rows: T[]): T[] {
	return rows.map((row) => convertDatesToISO(row));
}

/**
 * Parse a JSON field that may be returned as a string from MariaDB.
 * Drizzle's .$type<T>() doesn't guarantee deserialization for MySQL JSON columns.
 */
export function parseJsonField<T>(value: unknown, fallback: T): T {
	if (value === null || value === undefined) {
		return fallback;
	}
	if (typeof value === 'string') {
		try {
			return JSON.parse(value) as T;
		} catch {
			return fallback;
		}
	}
	return value as T;
}

// Create a paginated result from an array of items (in-memory)
export function createPagination<T>(items: T[], options: PaginationOptions): PaginatedResult<T> {
	const page = options.page || 1;
	const pageSize = options.pageSize || 10;
	const offset = (page - 1) * pageSize;
	const total = items.length;
	const paginatedItems = items.slice(offset, offset + pageSize);

	return {
		items: paginatedItems,
		total,
		page,
		pageSize,
		hasNextPage: offset + pageSize < total,
		hasPreviousPage: page > 1
	};
}
