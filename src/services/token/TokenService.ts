/**
 * @file src/services/token/TokenService.ts
 * @description Core Token Service - Handles token replacement in templates
 *
 * This service provides the core functionality for replacing {{token}} placeholders
 * in strings with actual values from context data. It also supports modifiers
 * using the pipe syntax: {{token | modifier(param)}}
 */

import { logger } from '@utils/logger';
import type {
	TokenContext,
	TokenReplacementResult,
	ModifierFunction
} from './types';
import { getNestedValue } from './utils';
import { modifierRegistry } from './modifiers';

/**
 * Regular expression to match token patterns: {{token | modifier(param)}}
 * Supports:
 * - Simple tokens: {{entry.title}}
 * - With modifiers: {{entry.title | upper}}
 * - With parameters: {{entry.title | truncate(50)}}
 * - Multiple modifiers: {{entry.title | upper | truncate(50)}}
 */
const TOKEN_PATTERN = /\{\{([^}]+)\}\}/g;

/**
 * Parses a token string to extract the token path and modifiers
 * @param tokenString The token string from the template (e.g., "entry.title | upper | truncate(50)")
 * @returns Object with token path and array of modifiers
 */
function parseToken(tokenString: string): {
	tokenPath: string;
	modifiers: Array<{ name: string; params?: string[] }>;
} {
	const parts = tokenString.split('|').map((p) => p.trim());
	const tokenPath = parts[0] || '';
	const modifiers: Array<{ name: string; params?: string[] }> = [];

	for (let i = 1; i < parts.length; i++) {
		const modifierPart = parts[i];
		// Match modifier name and optional parameters: "modifier(param1, param2)"
		const match = modifierPart.match(/^(\w+)(?:\(([^)]*)\))?$/);
		if (match) {
			const name = match[1];
			const paramsString = match[2];
			const params = paramsString
				? paramsString.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''))
				: undefined;
			modifiers.push({ name, params });
		}
	}

	return { tokenPath, modifiers };
}

/**
 * Applies modifiers to a value
 * @param value The value to modify
 * @param modifiers Array of modifier definitions
 * @returns The modified value
 */
async function applyModifiers(
	value: unknown,
	modifiers: Array<{ name: string; params?: string[] }>
): Promise<string> {
	let result: unknown = value;

	for (const modifier of modifiers) {
		const modifierFn = modifierRegistry.get(modifier.name);
		if (!modifierFn) {
			logger.warn(`Unknown modifier: ${modifier.name}`);
			continue;
		}

		try {
			result = await modifierFn(result, modifier.params);
		} catch (error) {
			logger.error(`Error applying modifier ${modifier.name}:`, error);
			// Continue with previous value if modifier fails
		}
	}

	// Convert to string
	if (result === null || result === undefined) {
		return '';
	}
	if (typeof result === 'string') {
		return result;
	}
	if (typeof result === 'number' || typeof result === 'boolean') {
		return String(result);
	}
	if (result instanceof Date) {
		return result.toISOString();
	}
	// For objects, try JSON stringify (with fallback)
	try {
		return JSON.stringify(result);
	} catch {
		return String(result);
	}
}

/**
 * Resolves a token path to its value from context
 * @param tokenPath The token path (e.g., "entry.title", "collection.name")
 * @param context The token context
 * @returns The resolved value or null if not found
 */
function resolveToken(tokenPath: string, context: TokenContext): unknown {
	const parts = tokenPath.split('.').filter(Boolean);
	if (parts.length === 0) {
		return null;
	}

	const [namespace, ...path] = parts;

	switch (namespace) {
		case 'entry':
			if (!context.entry) return null;
			return getNestedValue(context.entry, path);
		case 'collection':
			if (!context.collection) return null;
			return getNestedValue(context.collection, path);
		case 'site':
			if (!context.site) return null;
			return getNestedValue(context.site, path);
		case 'user':
			if (!context.user) return null;
			return getNestedValue(context.user, path);
		case 'system':
			// Handle system tokens with computed values
			if (path.length === 0) return null;
			
			const systemKey = path[0];
			const now = context.system?.now || new Date();
			
			// Return computed system values
			switch (systemKey) {
				case 'now':
					return now;
				case 'timestamp':
					return Math.floor(now.getTime() / 1000);
				case 'date':
					return now.toISOString().split('T')[0];
				case 'time':
					return now.toTimeString().split(' ')[0];
				case 'year':
					return now.getFullYear();
				case 'month':
					return now.getMonth() + 1;
				case 'day':
					return now.getDate();
				case 'hour':
					return now.getHours();
				case 'minute':
					return now.getMinutes();
				case 'second':
					return now.getSeconds();
				default:
					// Fall back to system object if it exists
					if (context.system) {
						return getNestedValue(context.system, path);
					}
					return null;
			}
		default:
			// Try to get from context directly
			return getNestedValue(context, [namespace, ...path]);
	}
}

/**
 * Replaces all tokens in a template string with values from context
 * @param template The template string containing {{token}} placeholders
 * @param context The context data for token resolution
 * @returns Result object with replaced template and metadata
 */
export async function replaceTokens(
	template: string,
	context: TokenContext
): Promise<TokenReplacementResult> {
	const result: TokenReplacementResult = {
		result: template,
		replaced: [],
		failed: [],
		warnings: []
	};

	if (!template || typeof template !== 'string') {
		return result;
	}

	// Find all token matches
	const matches = Array.from(template.matchAll(TOKEN_PATTERN));

	if (matches.length === 0) {
		result.result = template;
		return result;
	}

	let processedTemplate = template;

	// Process each token match
	for (const match of matches) {
		const fullMatch = match[0]; // e.g., "{{entry.title | upper}}"
		const tokenString = match[1]; // e.g., "entry.title | upper"

		try {
			const { tokenPath, modifiers } = parseToken(tokenString);

			// Resolve the token value
			const value = resolveToken(tokenPath, context);

			if (value === null || value === undefined) {
				result.failed.push(tokenPath);
				// Optionally keep the token in the output or replace with empty string
				processedTemplate = processedTemplate.replace(fullMatch, '');
				continue;
			}

			// Apply modifiers
			const modifiedValue = await applyModifiers(value, modifiers);

			// Replace in template
			processedTemplate = processedTemplate.replace(fullMatch, modifiedValue);
			result.replaced.push(tokenPath);
		} catch (error) {
			logger.error(`Error processing token ${tokenString}:`, error);
			result.failed.push(tokenString);
			// Replace with empty string on error
			processedTemplate = processedTemplate.replace(fullMatch, '');
		}
	}

	result.result = processedTemplate;
	return result;
}

/**
 * Synchronous version of replaceTokens (for simple cases without async modifiers)
 * @param template The template string
 * @param context The context data
 * @returns Result object
 */
export function replaceTokensSync(
	template: string,
	context: TokenContext
): TokenReplacementResult {
	const result: TokenReplacementResult = {
		result: template,
		replaced: [],
		failed: [],
		warnings: []
	};

	if (!template || typeof template !== 'string') {
		return result;
	}

	const matches = Array.from(template.matchAll(TOKEN_PATTERN));

	if (matches.length === 0) {
		result.result = template;
		return result;
	}

	let processedTemplate = template;

	for (const match of matches) {
		const fullMatch = match[0];
		const tokenString = match[1];

		try {
			const { tokenPath, modifiers } = parseToken(tokenString);
			const value = resolveToken(tokenPath, context);

			if (value === null || value === undefined) {
				result.failed.push(tokenPath);
				processedTemplate = processedTemplate.replace(fullMatch, '');
				continue;
			}

			// Apply modifiers synchronously (only sync modifiers)
			let modifiedValue: string = '';
			let currentValue: unknown = value;

			for (const modifier of modifiers) {
				const modifierFn = modifierRegistry.get(modifier.name);
				if (!modifierFn) {
					logger.warn(`Unknown modifier: ${modifier.name}`);
					continue;
				}

				// Check if modifier is synchronous (not async)
				try {
					const result = modifierFn(currentValue, modifier.params);
					if (result instanceof Promise) {
						// Can't handle async in sync version
						logger.warn(`Async modifier ${modifier.name} used in sync context`);
						modifiedValue = String(currentValue);
						break;
					}
					currentValue = result;
					modifiedValue = String(result);
				} catch (error) {
					logger.error(`Error applying modifier ${modifier.name}:`, error);
					modifiedValue = String(currentValue);
				}
			}

			if (modifiedValue === '' && modifiers.length === 0) {
				modifiedValue = String(value);
			}

			processedTemplate = processedTemplate.replace(fullMatch, modifiedValue);
			result.replaced.push(tokenPath);
		} catch (error) {
			logger.error(`Error processing token ${tokenString}:`, error);
			result.failed.push(tokenString);
			processedTemplate = processedTemplate.replace(fullMatch, '');
		}
	}

	result.result = processedTemplate;
	return result;
}

