/**
 * @file src/services/tokens/TokenService.ts
 * @description Core token replacement service
 * 
 * This service handles the replacement of {{token}} placeholders in text with actual values
 * from the provided context. It supports nested data access and modifiers.
 */

import type { TokenContext, TokenReplacementOptions, TokenReplacementResult } from './types';
import { applyModifier } from './modifiers';

/**
 * Regular expression to match token patterns: {{token.path|modifier:param1:param2}}
 */
const TOKEN_PATTERN = /\{\{([^}]+)\}\}/g;

/**
 * Helper to get nested property value from an object
 * @param obj - The object to traverse
 * @param path - Dot-notation path (e.g., "user.profile.name")
 * @returns The value at the path or undefined
 */
function getNestedValue(obj: Record<string, unknown> | undefined, path: string): unknown {
	if (!obj) return undefined;
	
	const parts = path.split('.');
	let current: unknown = obj;
	
	for (const part of parts) {
		if (current === null || current === undefined) {
			return undefined;
		}
		
		if (typeof current === 'object' && !Array.isArray(current)) {
			current = (current as Record<string, unknown>)[part];
		} else {
			return undefined;
		}
	}
	
	return current;
}

/**
 * Parse a token expression to extract the path and modifiers
 * @param expression - Token expression (e.g., "entry.title|uppercase|truncate:50")
 * @returns Object containing path and modifiers
 */
function parseTokenExpression(expression: string): {
	path: string;
	modifiers: Array<{ name: string; params: string[] }>;
} {
	const parts = expression.trim().split('|');
	const path = parts[0].trim();
	const modifiers = parts.slice(1).map((mod) => {
		const [name, ...params] = mod.trim().split(':');
		return { name: name.trim(), params: params.map((p) => p.trim()) };
	});
	
	return { path, modifiers };
}

/**
 * Resolve a single token to its value
 * @param tokenPath - The token path (e.g., "entry.title", "site.name")
 * @param context - The context containing data
 * @returns The resolved value or undefined
 */
function resolveTokenValue(tokenPath: string, context: TokenContext): unknown {
	const parts = tokenPath.split('.');
	const scope = parts[0];
	const remainingPath = parts.slice(1).join('.');
	
	switch (scope) {
		case 'entry':
			return getNestedValue(context.entry as Record<string, unknown>, remainingPath);
		
		case 'collection':
			return getNestedValue(context.collection as unknown as Record<string, unknown>, remainingPath);
		
		case 'site':
			return getNestedValue(context.siteConfig, remainingPath);
		
		case 'user':
			return getNestedValue(context.user as Record<string, unknown>, remainingPath);
		
		case 'system':
			// System tokens
			if (tokenPath === 'system.now') {
				return new Date().toISOString();
			}
			if (tokenPath === 'system.timestamp') {
				return Date.now();
			}
			if (tokenPath === 'system.year') {
				return new Date().getFullYear();
			}
			if (tokenPath === 'system.language') {
				return context.contentLanguage ?? 'en';
			}
			return undefined;
		
		default:
			// Try to resolve from context directly
			return getNestedValue(context, tokenPath);
	}
}

/**
 * Replace tokens in a template string with values from context
 * 
 * @param template - String containing {{token}} placeholders
 * @param context - Context object with data for replacement
 * @param options - Optional configuration for replacement behavior
 * @returns Result object with replaced string and metadata
 * 
 * @example
 * ```typescript
 * const result = replaceTokens(
 *   "Hello {{user.name|uppercase}}, welcome to {{site.name}}!",
 *   { 
 *     user: { name: "John" },
 *     siteConfig: { name: "My Site" }
 *   }
 * );
 * // result.result => "Hello JOHN, welcome to My Site!"
 * ```
 */
export function replaceTokens(
	template: string,
	context: TokenContext,
	options: TokenReplacementOptions = {}
): TokenReplacementResult {
	const {
		throwOnMissing = false,
		preserveUnresolved = false,
		onError,
		maxDepth = 10
	} = options;
	
	const replaced: string[] = [];
	const unresolved: string[] = [];
	const errors: Array<{ token: string; message: string }> = [];
	
	let result = template;
	let depth = 0;
	
	// Keep replacing until no more tokens or max depth reached
	while (depth < maxDepth) {
		let hasReplacements = false;
		
		result = result.replace(TOKEN_PATTERN, (match, expression) => {
			try {
				const { path, modifiers } = parseTokenExpression(expression);
				
				// Resolve the base value
				let value = resolveTokenValue(path, context);
				
				// If value is undefined/null
				if (value === undefined || value === null) {
					unresolved.push(path);
					
					if (throwOnMissing) {
						throw new Error(`Token not found: ${path}`);
					}
					
					return preserveUnresolved ? match : '';
				}
				
				// Apply modifiers in sequence
				let stringValue = String(value);
				for (const { name, params } of modifiers) {
					try {
						stringValue = applyModifier(name, stringValue, params);
					} catch (error) {
						const errorMsg = error instanceof Error ? error.message : 'Unknown error';
						errors.push({ token: expression, message: errorMsg });
						
						if (onError) {
							onError(error instanceof Error ? error : new Error(errorMsg), expression);
						}
						
						if (throwOnMissing) {
							throw error;
						}
						
						return preserveUnresolved ? match : stringValue;
					}
				}
				
				replaced.push(path);
				hasReplacements = true;
				return stringValue;
				
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				errors.push({ token: expression, message: errorMsg });
				
				if (onError) {
					onError(error instanceof Error ? error : new Error(errorMsg), expression);
				}
				
				if (throwOnMissing) {
					throw error;
				}
				
				return preserveUnresolved ? match : '';
			}
		});
		
		// If no replacements were made, we're done
		if (!hasReplacements) {
			break;
		}
		
		depth++;
	}
	
	// Warn if max depth reached
	if (depth >= maxDepth) {
		errors.push({
			token: 'system',
			message: `Maximum replacement depth (${maxDepth}) reached. Possible circular reference.`
		});
	}
	
	return {
		result,
		replaced: [...new Set(replaced)], // Remove duplicates
		unresolved: [...new Set(unresolved)],
		errors
	};
}

/**
 * Check if a string contains any tokens
 */
export function hasTokens(template: string): boolean {
	return TOKEN_PATTERN.test(template);
}

/**
 * Extract all token expressions from a template
 */
export function extractTokens(template: string): string[] {
	const tokens: string[] = [];
	const matches = template.matchAll(TOKEN_PATTERN);
	
	for (const match of matches) {
		tokens.push(match[1]);
	}
	
	return tokens;
}

/**
 * Validate token syntax
 */
export function validateTokenSyntax(expression: string): { valid: boolean; error?: string } {
	try {
		parseTokenExpression(expression);
		return { valid: true };
	} catch (error) {
		return {
			valid: false,
			error: error instanceof Error ? error.message : 'Invalid token syntax'
		};
	}
}
