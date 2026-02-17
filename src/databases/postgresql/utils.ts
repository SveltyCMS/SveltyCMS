/**
 * @file src/databases/postgresql/utils.ts
 * @description PostgreSQL utility functions for error handling and data transformation.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseError } from '../dbInterface';

// Create a standardized database error object
export function createDatabaseError(code: string, message: string, _originalError?: unknown): DatabaseError {
	return {
		code,
		message
	};
}

// Generate a new UUID v4 for database IDs
export function generateId(): string {
	return uuidv4();
}

// Serialize a value for PostgreSQL storage
export function serializeValue(value: unknown): unknown {
	if (value === undefined) {
		return null;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (typeof value === 'object' && value !== null) {
		return JSON.stringify(value);
	}
	return value;
}

// Deserialize a value from PostgreSQL storage
export function deserializeValue(value: unknown): unknown {
	if (typeof value === 'string') {
		// Try to parse as JSON
		try {
			const parsed = JSON.parse(value);
			return parsed;
		} catch {
			return value;
		}
	}
	return value;
}

// Convert MongoDB-style ObjectId filter to PostgreSQL compatible
export function convertIdFilter(filter: Record<string, any>): Record<string, any> {
	const result: Record<string, any> = {};
	for (const [key, value] of Object.entries(filter)) {
		if (key === '_id') {
			result.id = value;
		} else {
			result[key] = value;
		}
	}
	return result;
}

/**
 * Parse a JSON field that may come back as a string from PostgreSQL JSONB.
 * Drizzle's .$type<T>() does not guarantee runtime deserialization.
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

/**
 * Convert Date objects in a record to ISO strings.
 * PostgreSQL TIMESTAMP fields come back as Date objects from postgres.js.
 */
export function convertDatesToISO<T extends Record<string, any>>(obj: T): T {
	const result: Record<string, any> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (value instanceof Date) {
			result[key] = value.toISOString();
		} else {
			result[key] = value;
		}
	}
	return result as T;
}

/**
 * Convert dates in an array of records to ISO strings.
 */
export function convertArrayDatesToISO<T extends Record<string, any>>(arr: T[]): T[] {
	return arr.map((item) => convertDatesToISO(item));
}
