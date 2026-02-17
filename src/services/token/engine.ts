/**
 * @file src/services/token/engine.ts
 * @description Enhanced token engine with comprehensive descriptions and cross-collection support
 *
 * Features:
 * - Token Registry
 * - Token Resolution
 * - Token Caching
 * - Token Modifiers
 * - Token Permissions
 * - Token Validation
 * - Token Escaping
 * - Token Replacement
 */
import type { TokenContext, TokenDefinition, TokenRegistryConfig, TokenReplaceOptions, TokenCategory } from './types';
import type { Schema } from '@src/content/types';
import type { User } from '@src/databases/auth/types';
import { modifierRegistry } from './modifiers';
import { logger } from '@utils/logger';
import { publicEnv } from '@src/stores/globalSettings.svelte';

import { resolveRelationToken } from './relationResolver';

const ALLOWED_USER_FIELDS = ['_id', 'email', 'username', 'role', 'avatar', 'language', 'name'];

class TokenRegistryService {
	private resolvers = new Map<string, (ctx: TokenContext) => unknown>();
	private cache = new Map<string, { timestamp: number; data: Record<TokenCategory, TokenDefinition[]> }>();
	private CACHE_TTL = 1000 * 60 * 5; // 5 minutes
	private relationTokenGenerator:
		| ((schema: Schema, user: User | undefined, tenantId?: string, roles?: import('@src/databases/auth/types').Role[]) => Promise<TokenDefinition[]>)
		| null = null;

	public setRelationTokenGenerator(
		generator: (
			schema: Schema,
			user: User | undefined,
			tenantId?: string,
			roles?: import('@src/databases/auth/types').Role[]
		) => Promise<TokenDefinition[]>
	) {
		this.relationTokenGenerator = generator;
	}

	async resolve(tokenKey: string, ctx: TokenContext): Promise<unknown> {
		const resolver = this.resolvers.get(tokenKey);
		if (resolver) return resolver(ctx);

		// Security check for user fields
		if (tokenKey.startsWith('user.')) {
			const field = tokenKey.split('.')[1];
			if (!ALLOWED_USER_FIELDS.includes(field)) return '';
		}

		// Try relation resolver for deep entry tokens
		if (tokenKey.startsWith('entry.') && tokenKey.split('.').length > 2) {
			try {
				const val = await resolveRelationToken(tokenKey, ctx, ctx.user, ctx.tenantId);
				if (val !== null) return val;
			} catch (e) {
				logger.error(`Failed to resolve relation token ${tokenKey}:`, e);
			}
		}

		return tokenKey.split('.').reduce((curr: any, key) => curr?.[key], ctx);
	}

	clearCache() {
		this.resolvers.clear();
		this.cache.clear();
	}

	getTokens(schema?: Schema, user?: User, config: TokenRegistryConfig = {}): Record<TokenCategory, TokenDefinition[]> {
		const role = user?.role || 'public';
		const collection = schema?.name || 'global';
		const locale = config.locale || 'en';
		const key = `${role}:${collection}:${locale}`;

		const cached = this.cache.get(key);
		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			return cached.data;
		}

		const tokens: TokenDefinition[] = [];
		const add = (t: TokenDefinition) => {
			tokens.push(t);
			this.resolvers.set(t.token, t.resolve);
		};

		// 1. ENHANCED SYSTEM TOKENS
		if (config.includeSystem !== false) {
			add({
				token: 'system.now',
				name: 'Current Date & Time',
				category: 'system',
				type: 'date',
				description: 'Full ISO 8601 timestamp (e.g., 2025-11-24T14:30:00Z). Use with |date() modifier to format.',
				example: '{{system.now | date("MMM do, yyyy")}}',
				resolve: () => new Date().toISOString()
			});

			add({
				token: 'system.year',
				name: 'Current Year',
				category: 'system',
				type: 'number',
				description: 'Four-digit year (e.g., 2025). Perfect for copyright notices.',
				example: '© {{system.year}} Company Name',
				resolve: () => new Date().getFullYear()
			});

			add({
				token: 'system.timestamp',
				name: 'Unix Timestamp',
				category: 'system',
				type: 'number',
				description: 'Milliseconds since epoch. Useful for unique IDs or sorting.',
				example: '{{system.timestamp}}',
				resolve: () => Date.now()
			});

			add({
				token: 'system.date',
				name: 'Current Date',
				category: 'system',
				type: 'string',
				description: "Today's date in YYYY-MM-DD format.",
				example: '{{system.date}}',
				resolve: () => new Date().toISOString().split('T')[0]
			});

			add({
				token: 'system.time',
				name: 'Current Time',
				category: 'system',
				type: 'string',
				description: 'Current time in HH:MM:SS format (24-hour).',
				example: '{{system.time}}',
				resolve: () => new Date().toTimeString().split(' ')[0]
			});

			// Individual date components
			['month', 'day', 'hour', 'minute', 'second'].forEach((unit) => {
				add({
					token: `system.${unit}`,
					name: `Current ${unit.charAt(0).toUpperCase() + unit.slice(1)}`,
					category: 'system',
					type: 'number',
					description: `Current ${unit} value.`,
					resolve: () => {
						const date = new Date();
						if (unit === 'month') return date.getMonth() + 1;
						if (unit === 'day') return date.getDate();
						if (unit === 'hour') return date.getHours();
						if (unit === 'minute') return date.getMinutes();
						if (unit === 'second') return date.getSeconds();
						return 0;
					}
				});
			});
		}

		// 2. ENHANCED USER TOKENS
		if (user && config.includeUser !== false) {
			const userFieldDescriptions: Record<string, string> = {
				_id: 'Unique user identifier (UUID format)',
				email: "User's email address",
				username: "User's display name or handle",
				role: "User's permission level (admin, editor, viewer, etc.)",
				avatar: "URL to user's profile picture",
				language: "User's preferred language code (e.g., en, de, fr)",
				name: "User's full name"
			};

			ALLOWED_USER_FIELDS.forEach((field) => {
				if (field in user) {
					add({
						token: `user.${field}`,
						name: `User ${field.charAt(0).toUpperCase() + field.slice(1)}`,
						category: 'user',
						type: field === '_id' || field === 'email' ? 'string' : 'string',
						description: userFieldDescriptions[field] || `User's ${field} field`,
						example: field === 'name' ? `Welcome back, {{user.name}}!` : `{{user.${field}}}`,
						resolve: (c) => (c.user as any as Record<string, unknown>)?.[field]
					});
				}
			});
		}

		// 3. ENHANCED SITE TOKENS
		if (config.includeSite !== false && publicEnv) {
			const siteDescriptions: Record<string, string> = {
				SITE_NAME: "Your website's name (appears in titles and branding)",
				HOST_PROD: 'Production URL (e.g., https://example.com)',
				DEFAULT_CONTENT_LANGUAGE: 'Default language for content',
				PKG_VERSION: 'Current CMS version number',
				MEDIA_FOLDER: 'Path to uploaded media files'
			};

			Object.entries(publicEnv).forEach(([key, val]) => {
				if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
					add({
						token: `site.${key}`,
						name: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
						category: 'site',
						type: typeof val as 'string' | 'number' | 'boolean',
						description: siteDescriptions[key] || `Site configuration: ${key}`,
						example: key === 'SITE_NAME' ? `{{entry.title}} | {{site.SITE_NAME}}` : `{{site.${key}}}`,
						resolve: () => (publicEnv as Record<string, unknown>)[key]
					});
				}
			});
		}

		// 4. ENHANCED ENTRY TOKENS (including Relations)
		if (schema?.fields && config.includeEntry !== false) {
			// ... (existing code)
		}

		// 5. CUSTOM TOKENS
		if (config.customTokens && Array.isArray(config.customTokens)) {
			config.customTokens.forEach((t) => add(t));
		}

		// Grouping
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

		// Cache Result
		this.cache.set(key, { timestamp: Date.now(), data: grouped as Record<TokenCategory, TokenDefinition[]> });

		return grouped as Record<TokenCategory, TokenDefinition[]>;
	}
}

export const TokenRegistry = new TokenRegistryService();

// Regex and replaceTokens function remain the same...
const TOKEN_REGEX = /(?<!\\)\{\{([^}]+)\}\}/g;

export async function replaceTokens(template: string, context: TokenContext, options: TokenReplaceOptions = {}): Promise<string> {
	if (!template || !template.includes('{{')) return template.replace(/\\\{\{/g, '{{');

	const { maxDepth = 10, preserveUnresolved = true } = options;
	let result = template;
	let depth = 0;
	let hasMatches = true;

	while (hasMatches && depth < maxDepth) {
		hasMatches = false;
		const matches = Array.from(result.matchAll(TOKEN_REGEX));
		if (matches.length === 0) break;

		const replacements = await Promise.all(
			matches.map(async (match) => {
				const content = match[1];
				const [path, ...mods] = content.split('|').map((s) => s.trim());
				let value = await Promise.resolve(TokenRegistry.resolve(path, context));

				const isResolved = value !== undefined && value !== null;

				if (!isResolved) {
					if (options.throwOnMissing) {
						throw new Error(`Token "${path}" could not be resolved`);
					}
					if (preserveUnresolved) {
						return { fullMatch: match[0], value: match[0], resolved: false };
					}
					value = '';
				}

				try {
					for (const modStr of mods) {
						const m = modStr.match(/^(\w+)(?:\((.*)\))?$/);
						if (m) {
							const name = m[1].toLowerCase();
							const args = m[2] ? m[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')) : [];
							const fn = modifierRegistry.get(name);
							if (fn) value = await fn(value, args);
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
