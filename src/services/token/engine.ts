/**
 * @file src/services/token/engine.ts
 * @description Engine now infers types for smarter UI suggestions.
 *
 * Features:
 * - Typed tokens
 * - Token modifiers
 * - Token categories
 * - Token description
 * - Token type
 * - Token resolve function
 * - Token registry
 */
import type { TokenContext, TokenDefinition, TokenRegistryConfig, TokenReplaceOptions, TokenCategory } from './types';
import type { Schema } from '@src/content/types';
import type { User } from '@src/databases/auth/types';
import { modifierRegistry } from './modifiers';
import { logger } from '@utils/logger';
import { publicEnv } from '@src/stores/globalSettings.svelte';

const ALLOWED_USER_FIELDS = ['_id', 'email', 'username', 'role', 'avatar', 'language', 'name'];

class TokenRegistryService {
	private resolvers = new Map<string, (ctx: TokenContext) => any>();

	resolve(tokenKey: string, ctx: TokenContext): any {
		const resolver = this.resolvers.get(tokenKey);
		if (resolver) return resolver(ctx);
		// Basic security for user fields fallback
		if (tokenKey.startsWith('user.')) {
			const field = tokenKey.split('.')[1];
			if (!ALLOWED_USER_FIELDS.includes(field)) return '';
		}
		return tokenKey.split('.').reduce((curr: any, key) => curr?.[key], ctx);
	}

	private cache = new Map<string, { timestamp: number; data: Record<TokenCategory, TokenDefinition[]> }>();
	private CACHE_TTL = 1000 * 60 * 5; // 5 minutes

	clearCache() {
		this.resolvers.clear();
		this.cache.clear();
	}

	getTokens(schema?: Schema, user?: User, config: TokenRegistryConfig = {}): Record<TokenCategory, TokenDefinition[]> {
		// Generate Cache Key
		const role = user?.role || 'public';
		const collection = schema?.name || 'global';
		const locale = config.locale || 'en'; // Add locale to config if needed, or just use what we have
		const key = `${role}:${collection}:${locale}`;

		// Check Cache
		const cached = this.cache.get(key);
		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			// Re-register resolvers from cache (since they might be cleared if we clear resolvers but keep cache, though here we clear both)
			// Actually, resolvers need to be always available.
			// If we return cached tokens, we assume their resolvers are still in this.resolvers.
			// But if the app restarted, this.resolvers is empty.
			// Since this is in-memory, if app restarts, cache is empty too. So it's fine.
			return cached.data;
		}

		const tokens: TokenDefinition[] = [];
		const add = (t: TokenDefinition) => {
			tokens.push(t);
			this.resolvers.set(t.token, t.resolve);
		};

		// 1. System (Typed)
		if (config.includeSystem !== false) {
			add({
				token: 'system.now',
				name: 'Current Date',
				category: 'system',
				type: 'date',
				description: 'ISO Date',
				resolve: () => new Date().toISOString()
			});
			add({
				token: 'system.year',
				name: 'Current Year',
				category: 'system',
				type: 'number',
				description: '4-digit Year',
				resolve: () => new Date().getFullYear()
			});
		}

		// 2. User
		if (user && config.includeUser !== false) {
			ALLOWED_USER_FIELDS.forEach((field) => {
				if (field in user) {
					add({
						token: `user.${field}`,
						name: `User ${field.charAt(0).toUpperCase() + field.slice(1)}`,
						category: 'user',
						type: 'string',
						description: `User profile field: ${field}`,
						resolve: (c) => c.user?.[field as keyof User]
					});
				}
			});
		}

		// 3. Site
		if (config.includeSite !== false && publicEnv) {
			const siteMap: Record<string, { name: string; type: any }> = {
				SITE_NAME: { name: 'Site Name', type: 'string' },
				HOST_PROD: { name: 'Site URL', type: 'string' },
				DEFAULT_CONTENT_LANGUAGE: { name: 'Default Language', type: 'string' },
				PKG_VERSION: { name: 'System Version', type: 'string' },
				MEDIA_FOLDER: { name: 'Media Folder', type: 'string' }
			};

			Object.entries(publicEnv).forEach(([key, val]) => {
				if (key in siteMap) {
					add({
						token: `site.${key}`,
						name: siteMap[key].name,
						category: 'site',
						type: siteMap[key].type,
						description: `Site setting: ${key}`,
						resolve: () => publicEnv[key as keyof typeof publicEnv]
					});
				} else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
					add({
						token: `site.${key}`,
						name: key.replace(/_/g, ' '),
						category: 'site',
						type: typeof val as any,
						description: `Site setting: ${key}`,
						resolve: () => publicEnv[key as keyof typeof publicEnv]
					});
				}
			});
		}

		// 4. Entry (Schema Typed)
		if (schema?.fields && config.includeEntry !== false) {
			const WIDGET_TYPE_MAP: Record<string, any> = {
				// Core
				Checkbox: 'boolean',
				Date: 'date',
				DateRange: 'any', // Object {start, end}
				Group: 'any',
				Input: 'string',
				MediaUpload: 'any', // Array/Object
				MegaMenu: 'any',
				Radio: 'string',
				Relation: 'any',
				RichText: 'string',
				// Custom
				Address: 'any',
				ColorPicker: 'string',
				Currency: 'number',
				Email: 'string',
				Number: 'number',
				PhoneNumber: 'string',
				Rating: 'number',
				RemoteVideo: 'any',
				Seo: 'any'
			};

			schema.fields.forEach((field: any) => {
				const name = field.db_fieldName || field.label;
				if (!name) return;

				// Infer type from widget
				const widgetName = field.widget?.Name;
				const type = WIDGET_TYPE_MAP[widgetName] || 'string';

				add({
					token: `entry.${name}`,
					name: field.label || name,
					category: 'entry',
					type,
					description: `${widgetName || 'Field'}: ${field.helper || name}`,
					resolve: (c) => {
						const fieldData = c.entry?.[name];
						// If it's a widget object with a value property, extract it
						if (fieldData && typeof fieldData === 'object' && 'value' in fieldData) {
							return fieldData.value;
						}
						return fieldData;
					}
				});
			});
		}

		// Grouping
		const grouped: Record<string, TokenDefinition[]> = { entry: [], user: [], site: [], system: [], recentlyUsed: [] };
		tokens.forEach((t) => {
			if (!grouped[t.category]) grouped[t.category] = [];
			grouped[t.category].push(t);
		});

		// Cache Result
		this.cache.set(key, { timestamp: Date.now(), data: grouped as Record<TokenCategory, TokenDefinition[]> });

		return grouped as Record<TokenCategory, TokenDefinition[]>;
	}
}

export const TokenRegistry = new TokenRegistryService();

// Regex and replaceTokens function remain the same...
// Regex and replaceTokens function remain the same...
const TOKEN_REGEX = /(?<!\\)\{\{([^}]+)\}\}/g;

export async function replaceTokens(template: string, context: TokenContext, options: TokenReplaceOptions = {}): Promise<string> {
	if (!template || !template.includes('{{')) return template.replace(/\\\{\{/g, '{{');
	const { maxDepth = 10 } = options;
	let result = template;
	let depth = 0;
	let hasMatches = true;

	while (hasMatches && depth < maxDepth) {
		hasMatches = false;
		const matches = Array.from(result.matchAll(TOKEN_REGEX));
		if (matches.length === 0) break;

		const replacements = await Promise.all(
			matches.map(async (match) => {
				// match[1] is no longer the backslash due to lookbehind change, match[1] is the content
				const content = match[1];
				const [path, ...mods] = content.split('|').map((s) => s.trim());
				let value = await Promise.resolve(TokenRegistry.resolve(path, context));
				if (value === undefined || value === null) {
					value = '';
				}

				try {
					for (const modStr of mods) {
						// Try parens: name(arg1, arg2)
						const m = modStr.match(/^(\w+)(?:\((.*)\))?$/);
						if (m) {
							const name = m[1].toLowerCase();
							const args = m[2] ? m[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')) : [];
							const fn = modifierRegistry.get(name);
							if (fn) value = await fn(value as any, args);
						} else if (modStr.includes(':')) {
							// Try colons: name:arg1:arg2
							const parts = modStr.split(':');
							const name = parts.shift()!.toLowerCase();
							const args = parts.map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
							const fn = modifierRegistry.get(name);
							if (fn) value = await fn(value as any, args);
						} else {
							// Simple modifier: name
							const fn = modifierRegistry.get(modStr.toLowerCase());
							if (fn) value = await fn(value as any, []);
						}
					}
				} catch (e) {
					logger.error(String(e));
				}
				return { fullMatch: match[0], value: String(value), resolved: true };
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
	return result.replace(/\\\{\{/g, '{{');
}
