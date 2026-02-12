/**
 * @file src/services/token/helper.ts
 * @description Helper functions for token processing, validation, and extraction
 *
 * Features:
 * - Token Validation
 * - Token Escaping
 * - Token Replacement
 */
import { replaceTokens } from './engine';
import type { TokenContext } from './types';
import type { User } from '@src/databases/auth/types';
import { logger } from '@utils/logger';
import { validateTokenSyntax, extractTokenPaths, containsTokens } from './tokenUtils';

// Re-export pure utils
export { validateTokenSyntax, extractTokenPaths, containsTokens };

// Recursively processes tokens in an object or array
export async function processTokensInResponse(
	data: unknown,
	user: User | undefined,
	locale: string,
	context: Partial<TokenContext> & { maxDepth?: number; currentDepth?: number } = {}
): Promise<unknown> {
	if (!data) return data;

	// Prevent infinite recursion
	const maxDepth = context.maxDepth || 10;
	const currentDepth = context.currentDepth || 0;
	if (currentDepth > maxDepth) return data;

	// Handle Arrays
	if (Array.isArray(data)) {
		return Promise.all(data.map((item) => processTokensInResponse(item, user, locale, { ...context, currentDepth: currentDepth + 1 })));
	}

	// Handle Objects
	if (typeof data === 'object' && data !== null) {
		// Skip Date objects and other non-plain objects if needed
		if (data instanceof Date) return data;

		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
			result[key] = await processTokensInResponse(value, user, locale, { ...context, currentDepth: currentDepth + 1 });
		}
		return result;
	}

	// Handle Strings (Tokens)
	if (typeof data === 'string' && data.includes('{{')) {
		// Skip if it looks like a token but is escaped
		if (data.includes('\\{{')) return data.replace(/\\\{\{/g, '{{').replace(/\\\}\}/g, '}}');

		try {
			// Build full context
			const fullContext: TokenContext = {
				user,
				locale,
				system: context.system || { now: new Date().toISOString() as import('@databases/dbInterface').ISODateString }
			};

			return await replaceTokens(data, fullContext);
		} catch (error) {
			logger.warn('Token resolution failed', { error, token: data });
			return data; // Return original string on error
		}
	}

	return data;
}

// Previews token resolution (for UI)
export async function previewTokenResolution(text: string, user: User | undefined, context: Partial<TokenContext> = {}): Promise<string> {
	if (!containsTokens(text)) return text;

	try {
		return await replaceTokens(text, {
			user,
			...context,
			system: { now: new Date().toISOString() as import('@databases/dbInterface').ISODateString }
		} as any);
	} catch (error) {
		logger.error('Preview resolution failed', error);
		return 'Error resolving token';
	}
}
