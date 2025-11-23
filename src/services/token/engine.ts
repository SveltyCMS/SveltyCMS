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
			add({
				token: 'system.now',
				name: 'Current Timestamp',
				category: 'system',
				description: 'Inserts the current date and time in ISO format (e.g., 2023-10-27T10:00:00Z). Useful for timestamps.',
				resolve: () => new Date().toISOString()
			});
			add({
				token: 'system.year',
				name: 'Current Year',
				category: 'system',
				description: 'Inserts the current 4-digit year (e.g., 2025). Useful for copyright notices.',
				resolve: () => new Date().getFullYear()
			});
		}

		// User tokens (whitelisted)
		if (user && config.includeUser !== false) {
			const fieldDescriptions: Record<string, string> = {
				email: "The current user's email address.",
				username: "The current user's username.",
				role: "The current user's assigned role (e.g., admin, editor).",
				name: "The current user's full name (if set).",
				_id: 'The unique database ID of the current user.',
				language: "The current user's preferred interface language."
			};

			ALLOWED_USER_FIELDS.forEach((field) => {
				if (field in user) {
					add({
						token: `user.${field}`,
						name: `User ${field.charAt(0).toUpperCase() + field.slice(1)}`,
						category: 'user',
						description: fieldDescriptions[field] || `The ${field} of the currently logged-in user.`,
						resolve: (c) => c.user?.[field as keyof User]
					});
				}
			});
		}

		// Site tokens (publicEnv)
		if (config.includeSite !== false && publicEnv) {
			const safeSiteKeys = ['SITE_NAME', 'HOST_PROD', 'PKG_VERSION', 'DEFAULT_CONTENT_LANGUAGE', 'SEASONS'];
			const siteDescriptions: Record<string, string> = {
				SITE_NAME: 'The global name of this website as defined in settings.',
				HOST_PROD: 'The production domain/URL of the website.',
				PKG_VERSION: 'The current version number of the CMS software.',
				DEFAULT_CONTENT_LANGUAGE: 'The default language code for content (e.g., "en").',
				SEASONS: 'Configuration for seasonal features (if enabled).'
			};

			safeSiteKeys.forEach((key) => {
				if (key in publicEnv) {
					add({
						token: `site.${key}`,
						name: key
							.replace(/_/g, ' ')
							.toLowerCase()
							.replace(/\b\w/g, (l) => l.toUpperCase()),
						category: 'site',
						description: siteDescriptions[key] || `Global site configuration value for ${key}.`,
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

				// Generate a better description based on field type and props
				let desc = field.helper || `Content of the "${field.label || name}" field.`;
				if (field.translated) desc += ' (Translated)';
				if (field.required) desc += ' (Required)';

				add({
					token: `entry.${name}`,
					name: field.label || name,
					category: 'entry',
					description: desc,
					resolve: (c) => c.entry?.[name]
				});
			});
		}

		// Modifiers (Virtual tokens for documentation)
		const modifiers = [
			{ name: 'upper', desc: 'Converts text to UPPERCASE.' },
			{ name: 'lower', desc: 'Converts text to lowercase.' },
			{ name: 'capitalize', desc: 'Capitalizes the First Letter.' },
			{ name: 'trim', desc: 'Removes leading and trailing whitespace.' },
			{ name: 'slug', desc: 'Converts text into a URL-friendly slug.' },
			{ name: 'date', desc: 'Formats a date. Usage: |date(YYYY-MM-DD).' },
			{ name: 'truncate', desc: 'Shortens text to length. Usage: |truncate(10).' }
		];

		modifiers.forEach((mod) => {
			add({
				token: `| ${mod.name}`,
				name: `Modifier: ${mod.name}`,
				category: 'system',
				description: mod.desc,
				resolve: () => ''
			});
		});

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
