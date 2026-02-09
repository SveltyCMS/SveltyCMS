/**
 * @file src/databases/postgresql/utils.ts
 * @description PostgreSQL utility functions for error handling and data transformation.
 */

import type { DatabaseError } from '../dbInterface';

import { v4 as uuidv4 } from 'uuid';

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
	if (value === undefined) return null;
	if (value instanceof Date) return value.toISOString();
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
			result['id'] = value;
		} else {
			result[key] = value;
		}
	}
	return result;
}
