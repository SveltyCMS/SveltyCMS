/*
 * @file src/utils/tokenHelper.ts
 * @description Recursively resolves tokens in objects (used for API responses).
 *
 * @param {TokenContext} ctx - The token context.
 * @param {TokenRegistryConfig} config - The token registry configuration.
 * @returns {TokenDefinition[]} The token registry.
 *
 * Features:
 * - Resolves tokens in JSON API responses.
 * - Only processes JSON API responses for collection endpoints.
 * - Clones response body to avoid modifying the original response.
 * - Processes the response body with tokens.
 * - Returns the processed response.
 */

import { replaceTokens } from '@src/services/token/engine';
import type { TokenContext } from '@src/services/token/types';

export async function processObjectWithTokens<T>(data: T, context: TokenContext): Promise<T> {
	if (!data) return data;

	// Strings: resolve tokens
	if (typeof data === 'string') {
		if (data.includes('{{')) {
			return (await replaceTokens(data, context)) as T;
		}
		return data;
	}

	// Arrays: map recursively
	if (Array.isArray(data)) {
		return Promise.all(data.map((item) => processObjectWithTokens(item, context))) as Promise<T>;
	}

	// Objects: recurse over entries
	if (typeof data === 'object' && !(data instanceof Date)) {
		const result: any = {};
		for (const [key, value] of Object.entries(data)) {
			result[key] = await processObjectWithTokens(value, context);
		}
		return result;
	}

	// Primitive types: return unchanged
	return data;
}
