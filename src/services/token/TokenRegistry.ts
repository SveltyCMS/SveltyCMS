/**
 * @file src/services/token/TokenRegistry.ts
 * @description Token Registry Service - Discovers and provides available tokens
 *
 * This service introspects collection schemas, settings, and user data to
 * discover available tokens that can be used in templates.
 */

import { logger } from '@utils/logger';
import type {
	TokenDefinition,
	TokenCategory,
	TokenRegistryConfig
} from './types';
import type { Schema, FieldInstance } from '@src/content/types';
import type { User } from '@src/databases/auth/types';
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';
import type { Role } from '@src/databases/auth/types';

// Cache for token lists (keyed by collection + user role)
const tokenCache = new Map<string, TokenDefinition[]>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

/**
 * Clears the token cache (useful when collections or permissions change)
 */
export function clearTokenCache(): void {
	tokenCache.clear();
	cacheTimestamps.clear();
}

/**
 * Gets cache key for a collection and user role
 */
function getCacheKey(collectionId: string | undefined, userRole: string | undefined): string {
	return `${collectionId || 'none'}:${userRole || 'none'}`;
}

/**
 * Checks if cache entry is still valid
 */
function isCacheValid(key: string): boolean {
	const timestamp = cacheTimestamps.get(key);
	if (!timestamp) return false;
	return Date.now() - timestamp < CACHE_TTL;
}

/**
 * Gets tokens from cache if valid
 */
function getCachedTokens(key: string): TokenDefinition[] | null {
	if (isCacheValid(key)) {
		return tokenCache.get(key) || null;
	}
	return null;
}

/**
 * Caches tokens
 */
function cacheTokens(key: string, tokens: TokenDefinition[]): void {
	tokenCache.set(key, tokens);
	cacheTimestamps.set(key, Date.now());
}

/**
 * Discovers entry tokens from collection schema
 */
function discoverEntryTokens(
	schema: Schema | undefined,
	entry: Record<string, unknown> | undefined
): TokenDefinition[] {
	const tokens: TokenDefinition[] = [];

	if (!schema || !schema.fields) {
		return tokens;
	}

	for (const field of schema.fields) {
		// Skip if field is not a FieldInstance
		if (typeof field !== 'object' || field === null || !('db_fieldName' in field)) {
			continue;
		}

		const fieldInstance = field as FieldInstance;
		const fieldName = fieldInstance.db_fieldName || fieldInstance.label;

		if (!fieldName) continue;

		// Get example value from entry if available
		let example: string | undefined;
		if (entry && fieldName in entry) {
			const value = entry[fieldName];
			if (typeof value === 'string') {
				example = value.length > 50 ? value.substring(0, 50) + '...' : value;
			} else if (value !== null && value !== undefined) {
				example = String(value);
			}
		}

		tokens.push({
			token: `entry.${fieldName}`,
			name: fieldInstance.label || fieldName,
			description: fieldInstance.helper || `Value from field: ${fieldName}`,
			category: 'entry',
			example,
			path: ['entry', fieldName]
		});
	}

	return tokens;
}

/**
 * Discovers collection tokens from schema
 */
function discoverCollectionTokens(schema: Schema | undefined): TokenDefinition[] {
	const tokens: TokenDefinition[] = [];

	if (!schema) {
		return tokens;
	}

	// Collection name
	if (schema.name) {
		tokens.push({
			token: 'collection.name',
			name: 'Collection Name',
			description: 'The name of the collection',
			category: 'collection',
			example: schema.name,
			path: ['collection', 'name']
		});
	}

	// Collection label
	if (schema.label) {
		tokens.push({
			token: 'collection.label',
			name: 'Collection Label',
			description: 'The display label of the collection',
			category: 'collection',
			example: schema.label,
			path: ['collection', 'label']
		});
	}

	// Collection description
	if (schema.description) {
		tokens.push({
			token: 'collection.description',
			name: 'Collection Description',
			description: 'The description of the collection',
			category: 'collection',
			example: schema.description,
			path: ['collection', 'description']
		});
	}

	return tokens;
}

/**
 * Discovers site tokens from public config
 */
function discoverSiteTokens(site: Record<string, unknown> | undefined): TokenDefinition[] {
	const tokens: TokenDefinition[] = [];

	if (!site) {
		return tokens;
	}

	// Common site tokens
	const commonSiteFields = ['SITE_NAME', 'SITE_URL', 'SITE_DESCRIPTION'];

	for (const field of commonSiteFields) {
		if (field in site) {
			const value = site[field];
			tokens.push({
				token: `site.${field.toLowerCase()}`,
				name: field.replace(/_/g, ' '),
				description: `Site ${field.replace(/_/g, ' ').toLowerCase()}`,
				category: 'site',
				example: typeof value === 'string' ? value : String(value),
				path: ['site', field.toLowerCase()]
			});
		}
	}

	// Add any other site properties
	for (const [key, value] of Object.entries(site)) {
		if (!commonSiteFields.includes(key) && typeof value === 'string') {
			tokens.push({
				token: `site.${key.toLowerCase()}`,
				name: key.replace(/_/g, ' '),
				description: `Site ${key.replace(/_/g, ' ').toLowerCase()}`,
				category: 'site',
				example: value,
				path: ['site', key.toLowerCase()]
			});
		}
	}

	return tokens;
}

/**
 * Discovers user tokens
 */
function discoverUserTokens(user: User | undefined): TokenDefinition[] {
	const tokens: TokenDefinition[] = [];

	if (!user) {
		return tokens;
	}

	// User email
	if (user.email) {
		tokens.push({
			token: 'user.email',
			name: 'User Email',
			description: 'The email address of the current user',
			category: 'user',
			example: user.email,
			path: ['user', 'email']
		});
	}

	// User ID
	if (user._id) {
		tokens.push({
			token: 'user._id',
			name: 'User ID',
			description: 'The unique identifier of the current user',
			category: 'user',
			example: String(user._id),
			path: ['user', '_id']
		});
	}

	return tokens;
}

/**
 * Discovers system tokens
 */
function discoverSystemTokens(): TokenDefinition[] {
	const now = new Date();
	return [
		{
			token: 'system.now',
			name: 'Current Date/Time',
			description: 'The current date and time (Date object)',
			category: 'system',
			example: now.toISOString(),
			path: ['system', 'now']
		},
		{
			token: 'system.timestamp',
			name: 'Unix Timestamp',
			description: 'Current time as Unix timestamp (seconds since epoch)',
			category: 'system',
			example: String(Math.floor(now.getTime() / 1000)),
			path: ['system', 'timestamp']
		},
		{
			token: 'system.date',
			name: 'Current Date',
			description: 'Current date in YYYY-MM-DD format',
			category: 'system',
			example: now.toISOString().split('T')[0],
			path: ['system', 'date']
		},
		{
			token: 'system.time',
			name: 'Current Time',
			description: 'Current time in HH:mm:ss format',
			category: 'system',
			example: now.toTimeString().split(' ')[0],
			path: ['system', 'time']
		},
		{
			token: 'system.year',
			name: 'Current Year',
			description: 'Current year (4 digits)',
			category: 'system',
			example: String(now.getFullYear()),
			path: ['system', 'year']
		},
		{
			token: 'system.month',
			name: 'Current Month',
			description: 'Current month (1-12)',
			category: 'system',
			example: String(now.getMonth() + 1),
			path: ['system', 'month']
		},
		{
			token: 'system.day',
			name: 'Current Day',
			description: 'Current day of month (1-31)',
			category: 'system',
			example: String(now.getDate()),
			path: ['system', 'day']
		},
		{
			token: 'system.hour',
			name: 'Current Hour',
			description: 'Current hour (0-23)',
			category: 'system',
			example: String(now.getHours()),
			path: ['system', 'hour']
		},
		{
			token: 'system.minute',
			name: 'Current Minute',
			description: 'Current minute (0-59)',
			category: 'system',
			example: String(now.getMinutes()),
			path: ['system', 'minute']
		},
		{
			token: 'system.second',
			name: 'Current Second',
			description: 'Current second (0-59)',
			category: 'system',
			example: String(now.getSeconds()),
			path: ['system', 'second']
		}
	];
}

/**
 * Filters tokens based on field permissions
 */
function filterTokensByPermissions(
	tokens: TokenDefinition[],
	field: FieldInstance | undefined,
	user: User | undefined,
	roles: Role[] | undefined
): TokenDefinition[] {
	if (!field || !field.permissions || !user || !roles) {
		return tokens;
	}

	const userRole = roles.find((r) => r._id === user.role);
	if (!userRole) {
		return tokens;
	}

	// Admin users can see all tokens
	if (userRole.isAdmin) {
		return tokens;
	}

	// Filter entry tokens based on field permissions
	return tokens.filter((token) => {
		if (token.category !== 'entry') {
			return true; // Non-entry tokens are always available
		}

		// Check if user has read permission for this field
		const rolePermissions = field.permissions?.[user.role];
		if (!rolePermissions) {
			return true; // No restrictions = available
		}

		return rolePermissions.read !== false;
	});
}

/**
 * Gets all available tokens for a given context
 * @param schema Collection schema
 * @param user Current user
 * @param config Registry configuration
 * @param entry Current entry (optional, for examples)
 * @param site Site configuration (optional)
 * @param roles User roles (for permission checking)
 * @param field Current field (for permission filtering)
 * @returns Array of available token definitions
 */
export function getAvailableTokens(
	schema: Schema | undefined,
	user: User | undefined,
	config: TokenRegistryConfig = {},
	entry?: Record<string, unknown>,
	site?: Record<string, unknown>,
	roles?: Role[],
	field?: FieldInstance
): TokenDefinition[] {
	// Check cache first
	const cacheKey = getCacheKey(schema?._id, user?.role);
	const cached = getCachedTokens(cacheKey);
	if (cached) {
		// Still filter by field permissions (can't cache that)
		return filterTokensByPermissions(cached, field, user, roles);
	}

	const tokens: TokenDefinition[] = [];

	// Entry tokens
	if (config.includeEntry !== false) {
		tokens.push(...discoverEntryTokens(schema, entry));
	}

	// Collection tokens
	if (config.includeCollection !== false) {
		tokens.push(...discoverCollectionTokens(schema));
	}

	// Site tokens
	if (config.includeSite !== false) {
		tokens.push(...discoverSiteTokens(site));
	}

	// User tokens
	if (config.includeUser !== false) {
		tokens.push(...discoverUserTokens(user));
	}

	// System tokens
	if (config.includeSystem !== false) {
		tokens.push(...discoverSystemTokens());
	}

	// Custom tokens
	if (config.customTokens) {
		tokens.push(...config.customTokens);
	}

	// Cache the tokens (before permission filtering)
	cacheTokens(cacheKey, tokens);

	// Filter by permissions
	return filterTokensByPermissions(tokens, field, user, roles);
}

/**
 * Gets token definitions grouped by category
 */
export function getTokensByCategory(
	tokens: TokenDefinition[]
): Record<TokenCategory, TokenDefinition[]> {
	const grouped: Record<TokenCategory, TokenDefinition[]> = {
		entry: [],
		collection: [],
		site: [],
		user: [],
		system: []
	};

	for (const token of tokens) {
		if (token.category in grouped) {
			grouped[token.category].push(token);
		}
	}

	return grouped;
}

