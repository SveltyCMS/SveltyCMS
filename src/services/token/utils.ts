/**
 * @file src/services/token/utils.ts
 * @description Utility functions for token system
 */

/**
 * Safely gets a nested value from an object using a path array
 * @param obj The object to traverse
 * @param path Array of keys to traverse (e.g., ["entry", "title"])
 * @returns The value at the path, or null if not found
 */
export function getNestedValue(obj: unknown, path: string[]): unknown {
	if (!obj || path.length === 0) {
		return obj;
	}

	let current: unknown = obj;

	for (const key of path) {
		if (current === null || current === undefined) {
			return null;
		}

		if (typeof current !== 'object') {
			return null;
		}

		// Handle both plain objects and arrays
		if (Array.isArray(current)) {
			const index = parseInt(key, 10);
			if (isNaN(index) || index < 0 || index >= current.length) {
				return null;
			}
			current = current[index];
		} else if (key in current) {
			current = (current as Record<string, unknown>)[key];
		} else {
			return null;
		}
	}

	return current;
}

/**
 * Converts a value to a string safely
 * @param value The value to convert
 * @returns String representation
 */
export function safeStringify(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

