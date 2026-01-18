/**
 * @file shared/services/src/token/engine.ts
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
import type { Schema } from '@cms-types/content';
import type { User } from '@shared/database/auth/types';
import { modifierRegistry } from './modifiers';
import { logger } from '@shared/utils/logger';
import { publicEnv } from '@shared/stores/globalSettings.svelte';

// import { resolveRelationToken } from './relationResolver';

const ALLOWED_USER_FIELDS = ['_id', 'email', 'username', 'role', 'avatar', 'language', 'name'];

class TokenRegistryService {
	private resolvers = new Map<string, (ctx: TokenContext) => any>();
	private cache = new Map<string, { timestamp: number; data: Record<TokenCategory, TokenDefinition[]> }>();
	private CACHE_TTL = 1000 * 60 * 5; // 5 minutes
	private relationTokenGenerator: ((schema: Schema, user: User | undefined, tenantId?: string, roles?: any[]) => Promise<TokenDefinition[]>) | null =
		null;
	private relationResolver: ((token: string, ctx: TokenContext, user?: User, tenantId?: string) => Promise<any>) | null = null;

	public setRelationTokenGenerator(
		generator: (schema: Schema, user: User | undefined, tenantId?: string, roles?: any[]) => Promise<TokenDefinition[]>
	) {
		this.relationTokenGenerator = generator;
	}

	public setRelationResolver(resolver: (token: string, ctx: TokenContext, user?: User, tenantId?: string) => Promise<any>) {
		this.relationResolver = resolver;
	}

	async resolve(tokenKey: string, ctx: TokenContext): Promise<any> {
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
				if (this.relationResolver) {
					const val = await this.relationResolver(tokenKey, ctx, ctx.user, ctx.tenantId);
					if (val !== null) return val;
				}
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
					resolve: () => (new Date() as any)[`get${unit === 'day' ? 'Date' : unit.charAt(0).toUpperCase() + unit.slice(1)}`]()
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
						resolve: (c) => c.user?.[field as keyof User]
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
						type: typeof val as any,
						description: siteDescriptions[key] || `Site configuration: ${key}`,
						example: key === 'SITE_NAME' ? `{{entry.title}} | {{site.SITE_NAME}}` : `{{site.${key}}}`,
						resolve: () => publicEnv[key as keyof typeof publicEnv]
					});
				}
			});
		}

		// 4. ENHANCED ENTRY TOKENS (including Relations)
		if (schema?.fields && config.includeEntry !== false) {
			// Import relation token generator
			// Use injected relation token generator if available (Server-side only)
			if (this.relationTokenGenerator) {
				this.relationTokenGenerator(schema, user, config.tenantId, config.roles as any[])
					.then((relationTokens: TokenDefinition[]) => {
						relationTokens.forEach((t) => add(t));
					})
					.catch((err: unknown) => logger.error('Failed to load relation tokens', err));
			}

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

				// Generate smart descriptions based on widget type
				let description = field.helper || field.description || `Field: ${name}`;
				let example = `{{entry.${name}}}`;

				// Widget-specific examples
				if (widgetName === 'RichText') {
					example = `{{entry.${name} | truncate(150)}}`;
					description += ' (HTML content - use truncate for previews)';
				} else if (widgetName === 'Date') {
					example = `{{entry.${name} | date("MMM do, yyyy")}}`;
					description += ' (use date() modifier to format)';
				} else if (widgetName === 'MediaUpload') {
					example = `{{entry.${name}.url}}`;
					description += ' (access .url, .alt, .title properties)';
				} else if (widgetName === 'Number' || widgetName === 'Currency') {
					example = `{{entry.${name} | add(10)}}`;
					description += ' (supports math: add, subtract, multiply)';
				}

				add({
					token: `entry.${name}`,
					name: field.label || name,
					category: 'entry',
					type,
					description,
					example,
					resolve: (c) => {
						const fieldData = c.entry?.[name];

						// Handle widget object with value property
						let val = fieldData;
						if (fieldData && typeof fieldData === 'object' && 'value' in fieldData) {
							val = fieldData.value;
						}

						// Handle Localized Fields: If value is an object and has the requested locale
						if (val && typeof val === 'object' && c.locale && (c.locale in val || 'en' in val)) {
							return val[c.locale] || val['en'];
						}

						return val;
					}
				});
			});
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
