import { a as formatDateString } from './dateUtils.js';
import { logger } from './logger.js';
import { publicEnv } from './globalSettings.svelte.js';
const modifierRegistry = /* @__PURE__ */ new Map();
const functions = {
	// ===== TEXT MODIFIERS =====
	upper: (v) => String(v ?? '').toUpperCase(),
	lower: (v) => String(v ?? '').toLowerCase(),
	capitalize: (v) => String(v ?? '').replace(/\b\w/g, (c) => c.toUpperCase()),
	slug: (v) =>
		String(v ?? '')
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_-]+/g, '-'),
	truncate: (v, args) => {
		const len = parseInt(args?.[0] || '50');
		const s = String(v ?? '');
		return s.length > len ? s.substring(0, len) + (args?.[1] ?? '...') : s;
	},
	// ===== MATH MODIFIERS =====
	add: (v, args) => String(parseFloat(String(v)) + parseFloat(args?.[0] || '0')),
	subtract: (v, args) => String(parseFloat(String(v)) - parseFloat(args?.[0] || '0')),
	multiply: (v, args) => String(parseFloat(String(v)) * parseFloat(args?.[0] || '1')),
	divide: (v, args) => {
		const divisor = parseFloat(args?.[0] || '1');
		return divisor === 0 ? 'NaN' : String(parseFloat(String(v)) / divisor);
	},
	round: (v, args) => {
		const decimals = parseInt(args?.[0] || '0');
		return String(Math.round(parseFloat(String(v)) * Math.pow(10, decimals)) / Math.pow(10, decimals));
	},
	ceil: (v) => String(Math.ceil(parseFloat(String(v)))),
	floor: (v) => String(Math.floor(parseFloat(String(v)))),
	abs: (v) => String(Math.abs(parseFloat(String(v)))),
	min: (v, args) => String(Math.min(parseFloat(String(v)), parseFloat(args?.[0] || '0'))),
	max: (v, args) => String(Math.max(parseFloat(String(v)), parseFloat(args?.[0] || '0'))),
	number: (v, args) => {
		const decimals = parseInt(args?.[0] || '0');
		return parseFloat(String(v)).toFixed(decimals);
	},
	// ===== DATE MODIFIERS =====
	date: (v, args) => {
		if (!v) return '';
		const presets = {
			iso: "yyyy-MM-dd'T'HH:mm:ssxxx",
			date: 'yyyy-MM-dd',
			time: 'HH:mm:ss',
			datetime: 'yyyy-MM-dd HH:mm:ss',
			short: 'M/d/yy',
			long: 'MMMM d, yyyy',
			full: 'EEEE, MMMM d, yyyy',
			relative: 'relative',
			// Special case
			timestamp: 'timestamp'
			// Special case
		};
		const format = args?.[0] || 'date';
		const dateObj = typeof v === 'string' ? new Date(v) : v;
		if (format === 'timestamp') {
			return String(dateObj.getTime());
		}
		if (format === 'relative') {
			const now = Date.now();
			const diff = now - dateObj.getTime();
			const seconds = Math.floor(diff / 1e3);
			const minutes = Math.floor(seconds / 60);
			const hours = Math.floor(minutes / 60);
			const days = Math.floor(hours / 24);
			if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
			if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
			if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
			return 'just now';
		}
		const actualFormat = presets[format] || format;
		return formatDateString(v, actualFormat, '');
	},
	// ===== PATH MODIFIERS =====
	basename: (v) => {
		const path = String(v ?? '');
		return path.split('/').pop() || path;
	},
	dirname: (v) => {
		const path = String(v ?? '');
		const parts = path.split('/');
		parts.pop();
		return parts.join('/') || '/';
	},
	extension: (v) => {
		const path = String(v ?? '');
		const match = path.match(/\.([^.]+)$/);
		return match ? match[1] : '';
	},
	filename: (v) => {
		const path = String(v ?? '');
		const base = path.split('/').pop() || path;
		return base.replace(/\.[^.]+$/, '');
	},
	path: (v) => String(v ?? '').replace(/\\/g, '/'),
	cleanurl: (v) => {
		return String(v ?? '')
			.replace(/^https?:\/\//, '')
			.replace(/\/$/, '');
	},
	// ===== LOGIC MODIFIERS =====
	default: (v, args) => (!v || v === '' ? (args?.[0] ?? '') : String(v)),
	if: (v, args) => (v && v !== 'false' ? (args?.[0] ?? '') : (args?.[1] ?? '')),
	eq: (v, args) => (String(v) === String(args?.[0]) ? 'true' : 'false'),
	ne: (v, args) => (String(v) !== String(args?.[0]) ? 'true' : 'false'),
	gt: (v, args) => (parseFloat(String(v)) > parseFloat(args?.[0] || '0') ? 'true' : 'false'),
	lt: (v, args) => (parseFloat(String(v)) < parseFloat(args?.[0] || '0') ? 'true' : 'false'),
	// ===== SECURITY =====
	escape: (v) =>
		String(v ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;'),
	// ===== CMS SPECIFIC =====
	image_style: (v, args) => {
		if (!v) return '';
		const style = args?.[0] || 'original';
		return `/api/media/${v}?style=${style}`;
	}
};
Object.entries(functions).forEach(([k, v]) => {
	modifierRegistry.set(k.toLowerCase(), v);
});
const ALLOWED_USER_FIELDS = ['_id', 'email', 'username', 'role', 'avatar', 'language', 'name'];
class TokenRegistryService {
	resolvers = /* @__PURE__ */ new Map();
	cache = /* @__PURE__ */ new Map();
	CACHE_TTL = 1e3 * 60 * 5;
	// 5 minutes
	relationTokenGenerator = null;
	relationResolver = null;
	setRelationTokenGenerator(generator) {
		this.relationTokenGenerator = generator;
	}
	setRelationResolver(resolver) {
		this.relationResolver = resolver;
	}
	async resolve(tokenKey, ctx) {
		const resolver = this.resolvers.get(tokenKey);
		if (resolver) return resolver(ctx);
		if (tokenKey.startsWith('user.')) {
			const field = tokenKey.split('.')[1];
			if (!ALLOWED_USER_FIELDS.includes(field)) return '';
		}
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
		return tokenKey.split('.').reduce((curr, key) => curr?.[key], ctx);
	}
	clearCache() {
		this.resolvers.clear();
		this.cache.clear();
	}
	getTokens(schema, user, config = {}) {
		const role = user?.role || 'public';
		const collection = schema?.name || 'global';
		const locale = config.locale || 'en';
		const key = `${role}:${collection}:${locale}`;
		const cached = this.cache.get(key);
		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			return cached.data;
		}
		const tokens = [];
		const add = (t) => {
			tokens.push(t);
			this.resolvers.set(t.token, t.resolve);
		};
		if (config.includeSystem !== false) {
			add({
				token: 'system.now',
				name: 'Current Date & Time',
				category: 'system',
				type: 'date',
				description: 'Full ISO 8601 timestamp (e.g., 2025-11-24T14:30:00Z). Use with |date() modifier to format.',
				example: '{{system.now | date("MMM do, yyyy")}}',
				resolve: () => /* @__PURE__ */ new Date().toISOString()
			});
			add({
				token: 'system.year',
				name: 'Current Year',
				category: 'system',
				type: 'number',
				description: 'Four-digit year (e.g., 2025). Perfect for copyright notices.',
				example: '© {{system.year}} Company Name',
				resolve: () => /* @__PURE__ */ new Date().getFullYear()
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
				resolve: () => /* @__PURE__ */ new Date().toISOString().split('T')[0]
			});
			add({
				token: 'system.time',
				name: 'Current Time',
				category: 'system',
				type: 'string',
				description: 'Current time in HH:MM:SS format (24-hour).',
				example: '{{system.time}}',
				resolve: () => /* @__PURE__ */ new Date().toTimeString().split(' ')[0]
			});
			['month', 'day', 'hour', 'minute', 'second'].forEach((unit) => {
				add({
					token: `system.${unit}`,
					name: `Current ${unit.charAt(0).toUpperCase() + unit.slice(1)}`,
					category: 'system',
					type: 'number',
					description: `Current ${unit} value.`,
					resolve: () => /* @__PURE__ */ new Date()[`get${unit === 'day' ? 'Date' : unit.charAt(0).toUpperCase() + unit.slice(1)}`]()
				});
			});
		}
		if (user && config.includeUser !== false) {
			const userFieldDescriptions = {
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
						resolve: (c) => c.user?.[field]
					});
				}
			});
		}
		if (config.includeSite !== false && publicEnv) {
			const siteDescriptions = {
				SITE_NAME: "Your website's name (appears in titles and branding)",
				HOST_PROD: 'Production URL (e.g., https://example.com)',
				DEFAULT_CONTENT_LANGUAGE: 'Default language for content',
				PKG_VERSION: 'Current CMS version number',
				MEDIA_FOLDER: 'Path to uploaded media files'
			};
			Object.entries(publicEnv).forEach(([key2, val]) => {
				if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
					add({
						token: `site.${key2}`,
						name: key2.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
						category: 'site',
						type: typeof val,
						description: siteDescriptions[key2] || `Site configuration: ${key2}`,
						example: key2 === 'SITE_NAME' ? `{{entry.title}} | {{site.SITE_NAME}}` : `{{site.${key2}}}`,
						resolve: () => publicEnv[key2]
					});
				}
			});
		}
		if (schema?.fields && config.includeEntry !== false) {
			if (this.relationTokenGenerator) {
				this.relationTokenGenerator(schema, user, config.tenantId, config.roles)
					.then((relationTokens) => {
						relationTokens.forEach((t) => add(t));
					})
					.catch((err) => logger.error('Failed to load relation tokens', err));
			}
			const WIDGET_TYPE_MAP = {
				// Core
				Checkbox: 'boolean',
				Date: 'date',
				DateRange: 'any',
				// Object {start, end}
				Group: 'any',
				Input: 'string',
				MediaUpload: 'any',
				// Array/Object
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
			schema.fields.forEach((field) => {
				const name = field.db_fieldName || field.label;
				if (!name) return;
				const widgetName = field.widget?.Name;
				const type = WIDGET_TYPE_MAP[widgetName] || 'string';
				let description = field.helper || field.description || `Field: ${name}`;
				let example = `{{entry.${name}}}`;
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
						if (fieldData && typeof fieldData === 'object' && 'value' in fieldData) {
							return fieldData.value;
						}
						return fieldData;
					}
				});
			});
		}
		const grouped = {
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
		this.cache.set(key, { timestamp: Date.now(), data: grouped });
		return grouped;
	}
}
const TokenRegistry = new TokenRegistryService();
const TOKEN_REGEX = /(?<!\\)\{\{([^}]+)\}\}/g;
async function replaceTokens(template, context, options = {}) {
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
				const content = match[1];
				const [path, ...mods] = content.split('|').map((s) => s.trim());
				let value = await Promise.resolve(TokenRegistry.resolve(path, context));
				if (value === void 0 || value === null) {
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
export { TokenRegistry as T, replaceTokens as r };
//# sourceMappingURL=engine.js.map
