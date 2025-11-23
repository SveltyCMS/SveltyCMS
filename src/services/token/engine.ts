/*
 * @file src/services/token/engine.ts
 * @description Core engine for token discovery and replacement.
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

import type { TokenContext, TokenDefinition, TokenRegistryConfig, TokenReplaceOptions, TokenCategory } from './types';
import type { Schema } from '@src/content/types';
import type { User } from '@src/databases/auth/types';
import { modifierRegistry } from './modifiers';
import { logger } from '@utils/logger';
import { publicEnv } from '@src/stores/globalSettings.svelte';

// --- SECURITY CONFIGURATION ---
const ALLOWED_USER_FIELDS = ['_id', 'email', 'username', 'role', 'avatar', 'language', 'name'];

// --- REGISTRY (Discovery System) ---
class TokenRegistryService {
	private resolvers = new Map<string, (ctx: TokenContext) => any>();

	/** Resolve a token key to a value, applying security checks */
	resolve(tokenKey: string, ctx: TokenContext): any {
		const resolver = this.resolvers.get(tokenKey);
		if (resolver) return resolver(ctx);

		// Security: block disallowed user fields
		if (tokenKey.startsWith('user.')) {
			const field = tokenKey.split('.')[1];
			if (!ALLOWED_USER_FIELDS.includes(field)) {
				logger.warn(`[TokenSecurity] Blocked access to restricted token: ${tokenKey}`);
				return '';
			}
		}

		return tokenKey.split('.').reduce((curr: any, key) => curr?.[key], ctx);
	}

	/** Generate token list for UI picker */
	getTokens(schema?: Schema, user?: User, config: TokenRegistryConfig = {}): Record<TokenCategory, TokenDefinition[]> {
		const tokens: TokenDefinition[] = [];
		const add = (t: TokenDefinition) => {
			tokens.push(t);
			this.resolvers.set(t.token, t.resolve);
		};

		// System tokens
		if (config.includeSystem !== false) {
			add({ token: 'system.now', name: 'Now', category: 'system', description: 'Current timestamp', resolve: () => new Date().toISOString() });
			add({ token: 'system.year', name: 'Year', category: 'system', description: 'Current year', resolve: () => new Date().getFullYear() });
		}

		// User tokens (whitelisted)
		if (user && config.includeUser !== false) {
			ALLOWED_USER_FIELDS.forEach((field) => {
				if (field in user) {
					add({
						token: `user.${field}`,
						name: `User ${field}`,
						category: 'user',
						description: `Current user ${field}`,
						resolve: (c) => c.user?.[field as keyof User]
					});
				}
			});
		}

		// Site tokens (publicEnv)
		if (config.includeSite !== false && publicEnv) {
			const safeSiteKeys = ['SITE_NAME', 'HOST_PROD', 'PKG_VERSION', 'DEFAULT_CONTENT_LANGUAGE', 'SEASONS'];
			safeSiteKeys.forEach((key) => {
				if (key in publicEnv) {
					add({
						token: `site.${key}`,
						name: key
							.replace(/_/g, ' ')
							.toLowerCase()
							.replace(/\b\w/g, (l) => l.toUpperCase()),
						category: 'site',
						description: `Public setting ${key}`,
						resolve: () => publicEnv[key as keyof typeof publicEnv]
					});
				}
			});
		}

		// Entry tokens (from schema fields)
		if (schema?.fields && config.includeEntry !== false) {
			schema.fields.forEach((field: any) => {
				const name = field.db_fieldName || field.label;
				if (!name) return;
				add({
					token: `entry.${name}`,
					name: field.label || name,
					category: 'entry',
					description: field.helper || `Value of ${name}`,
					resolve: (c) => c.entry?.[name]
				});
			});
		}

		// Custom tokens
		if (config.customTokens) config.customTokens.forEach((t) => add(t));

		// Group by category
		const grouped: Record<string, TokenDefinition[]> = {
			entry: [],
			user: [],
			site: [],
			system: [],
			recentlyUsed: []
		};
		tokens.forEach((t) => {
			if (!grouped[t.category]) grouped[t.category] = [];
			grouped[t.category].push(t);
		});
		return grouped as Record<TokenCategory, TokenDefinition[]>;
	}
}

export const TokenRegistry = new TokenRegistryService();

// --- SERVICE (Replacement Engine) ---
const TOKEN_REGEX = /(\\)?\{\{([^}]+)\}\}/g; // matches escaped \{{token}} or {{token}}

export async function replaceTokens(template: string, context: TokenContext, options: TokenReplaceOptions = {}): Promise<string> {
	if (!template || typeof template !== 'string' || !template.includes('{{')) return template;

	const { maxDepth = 10, preserveUnresolved = false, throwOnMissing = false } = options;
	let result = template;
	let depth = 0;
	let hasMatches = true;

	while (hasMatches && depth < maxDepth) {
		hasMatches = false;
		const matches = Array.from(result.matchAll(TOKEN_REGEX));
		if (matches.length === 0) break;

		const replacements = await Promise.all(
			matches.map(async (match) => {
				const fullMatch = match[0];
				const isEscaped = !!match[1];
				const content = match[2]; // tokenPath | modifiers

				if (isEscaped) {
					return { fullMatch, value: `{{${content}}}`, resolved: true };
				}

				const [tokenPath, ...modifierParts] = content.split('|').map((s) => s.trim());
				let value = await Promise.resolve(TokenRegistry.resolve(tokenPath, context));

				if (value === undefined || value === null) {
					if (throwOnMissing) throw new Error(`Missing token: ${tokenPath}`);
					if (preserveUnresolved) return { fullMatch, value: fullMatch, resolved: false };
					value = '';
				}

				// Apply modifiers sequentially
				try {
					for (const modStr of modifierParts) {
						const matchMod = modStr.match(/^(\w+)(?:\((.*)\))?$/);
						if (matchMod) {
							const name = matchMod[1].toLowerCase();
							const argsRaw = matchMod[2];
							const args = argsRaw ? argsRaw.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')) : [];
							const fn = modifierRegistry.get(name);
							if (fn) value = await fn(value, args);
						} else {
							const fn = modifierRegistry.get(modStr.toLowerCase());
							if (fn) value = await fn(value, []);
						}
					}
				} catch (e) {
					logger.error(`Error applying modifiers on ${tokenPath}`, e);
				}

				return { fullMatch, value: String(value), resolved: true };
			})
		);

		for (const rep of replacements) {
			if (rep.resolved) {
				result = result.replace(rep.fullMatch, rep.value);
				hasMatches = true;
			}
		}
		depth++;
	}

	if (depth >= maxDepth) {
		logger.warn(`Token replacement hit max recursion depth (${maxDepth})`);
	}
	return result;
}
