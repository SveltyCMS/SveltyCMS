/**
 * @file src/services/tokens/TokenRegistry.ts
 * @description Dynamic token registry that discovers available tokens from schemas and configuration
 * 
 * This service introspects collection schemas, settings, and user data to provide
 * a comprehensive list of available tokens for UI display and validation.
 */

import type { Schema, FieldInstance } from '../../content/types';
import type { TokenDefinition, TokenContext, GetTokensOptions, TokenScope } from './types';

/**
 * Get system-level tokens that are always available
 */
function getSystemTokens(): TokenDefinition[] {
	return [
		{
			key: 'system.now',
			scope: 'system',
			label: 'Current Date/Time',
			description: 'Current date and time in ISO format',
			type: 'date',
			available: true,
			previewValue: new Date().toISOString()
		},
		{
			key: 'system.timestamp',
			scope: 'system',
			label: 'Current Timestamp',
			description: 'Current Unix timestamp in milliseconds',
			type: 'number',
			available: true,
			previewValue: String(Date.now())
		},
		{
			key: 'system.year',
			scope: 'system',
			label: 'Current Year',
			description: 'Current year (4 digits)',
			type: 'number',
			available: true,
			previewValue: String(new Date().getFullYear())
		},
		{
			key: 'system.language',
			scope: 'system',
			label: 'Content Language',
			description: 'Current content language code',
			type: 'string',
			available: true,
			previewValue: 'en'
		}
	];
}

/**
 * Get user-related tokens based on current user data
 */
function getUserTokens(context: TokenContext): TokenDefinition[] {
	const user = context.user;
	const hasUser = !!user;
	
	const tokens: TokenDefinition[] = [
		{
			key: 'user.id',
			scope: 'user',
			label: 'User ID',
			description: 'Unique identifier of the current user',
			type: 'string',
			available: hasUser && !!user?.id,
			previewValue: user?.id
		},
		{
			key: 'user.email',
			scope: 'user',
			label: 'User Email',
			description: 'Email address of the current user',
			type: 'string',
			available: hasUser && !!user?.email,
			previewValue: user?.email,
			requiresPermission: 'view_user_info'
		},
		{
			key: 'user.name',
			scope: 'user',
			label: 'User Name',
			description: 'Full name of the current user',
			type: 'string',
			available: hasUser && !!user?.name,
			previewValue: user?.name
		},
		{
			key: 'user.role',
			scope: 'user',
			label: 'User Role',
			description: 'Role of the current user',
			type: 'string',
			available: hasUser && !!user?.role,
			previewValue: user?.role
		}
	];
	
	// Add any additional user properties dynamically
	if (user) {
		for (const [key, value] of Object.entries(user)) {
			if (!['id', 'email', 'name', 'role'].includes(key)) {
				tokens.push({
					key: `user.${key}`,
					scope: 'user',
					label: `User ${key}`,
					description: `User property: ${key}`,
					type: typeof value as 'string' | 'number' | 'boolean',
					available: true,
					previewValue: String(value)
				});
			}
		}
	}
	
	return tokens;
}

/**
 * Get site/config tokens from site configuration
 */
function getSiteTokens(context: TokenContext): TokenDefinition[] {
	const siteConfig = context.siteConfig ?? {};
	const tokens: TokenDefinition[] = [];
	
	// Recursively extract config properties
	function extractConfigTokens(obj: Record<string, unknown>, prefix: string = 'site') {
		for (const [key, value] of Object.entries(obj)) {
			const tokenKey = `${prefix}.${key}`;
			
			if (value && typeof value === 'object' && !Array.isArray(value)) {
				// Nested object - recurse
				extractConfigTokens(value as Record<string, unknown>, tokenKey);
			} else {
				// Leaf value - add token
				tokens.push({
					key: tokenKey,
					scope: 'site',
					label: `Site ${key}`,
					description: `Site configuration: ${key}`,
					type: Array.isArray(value) ? 'array' : typeof value as 'string' | 'number' | 'boolean',
					available: true,
					previewValue: Array.isArray(value) ? JSON.stringify(value) : String(value)
				});
			}
		}
	}
	
	extractConfigTokens(siteConfig);
	
	return tokens;
}

/**
 * Get collection-level tokens from collection schema
 */
function getCollectionTokens(context: TokenContext): TokenDefinition[] {
	const collection = context.collection;
	
	if (!collection) {
		return [];
	}
	
	const tokens: TokenDefinition[] = [];
	
	// Collection metadata
	if (collection.name) {
		tokens.push({
			key: 'collection.name',
			scope: 'collection',
			label: 'Collection Name',
			description: 'Name of the current collection',
			type: 'string',
			available: true,
			previewValue: collection.name
		});
	}
	
	if (collection.label) {
		tokens.push({
			key: 'collection.label',
			scope: 'collection',
			label: 'Collection Label',
			description: 'Display label of the collection',
			type: 'string',
			available: true,
			previewValue: collection.label
		});
	}
	
	if (collection.slug) {
		tokens.push({
			key: 'collection.slug',
			scope: 'collection',
			label: 'Collection Slug',
			description: 'URL slug of the collection',
			type: 'string',
			available: true,
			previewValue: collection.slug
		});
	}
	
	if (collection.description) {
		tokens.push({
			key: 'collection.description',
			scope: 'collection',
			label: 'Collection Description',
			description: 'Description of the collection',
			type: 'string',
			available: true,
			previewValue: collection.description
		});
	}
	
	return tokens;
}

/**
 * Get entry-level tokens from collection schema fields
 */
function getEntryTokens(context: TokenContext): TokenDefinition[] {
	const collection = context.collection;
	
	if (!collection || !collection.fields) {
		return [];
	}
	
	const tokens: TokenDefinition[] = [];
	
	// Common metadata fields
	tokens.push(
		{
			key: 'entry._id',
			scope: 'entry',
			label: 'Entry ID',
			description: 'Unique identifier of the entry',
			type: 'string',
			available: true
		},
		{
			key: 'entry.status',
			scope: 'entry',
			label: 'Entry Status',
			description: 'Publication status of the entry',
			type: 'string',
			available: true
		},
		{
			key: 'entry.createdAt',
			scope: 'entry',
			label: 'Created At',
			description: 'When the entry was created',
			type: 'date',
			available: true
		},
		{
			key: 'entry.updatedAt',
			scope: 'entry',
			label: 'Updated At',
			description: 'When the entry was last updated',
			type: 'date',
			available: true
		},
		{
			key: 'entry.createdBy',
			scope: 'entry',
			label: 'Created By',
			description: 'User who created the entry',
			type: 'string',
			available: true
		},
		{
			key: 'entry.updatedBy',
			scope: 'entry',
			label: 'Updated By',
			description: 'User who last updated the entry',
			type: 'string',
			available: true
		}
	);
	
	// Extract fields from schema
	for (const field of collection.fields) {
		// Type guard to check if field is a FieldInstance
		if (field && typeof field === 'object' && 'db_fieldName' in field) {
			const fieldInstance = field as FieldInstance;
			
			if (!fieldInstance.db_fieldName) continue;
			
			tokens.push({
				key: `entry.${fieldInstance.db_fieldName}`,
				scope: 'entry',
				label: fieldInstance.label || fieldInstance.db_fieldName,
				description: fieldInstance.helper || `Field: ${fieldInstance.label}`,
				type: 'string', // Simplified - could be inferred from widget type
				available: true,
				field: fieldInstance
			});
		}
	}
	
	return tokens;
}

/**
 * Get all available tokens based on context and options
 * 
 * @param context - Current context (schema, user, config, etc.)
 * @param options - Options for filtering tokens
 * @returns Array of available token definitions
 * 
 * @example
 * ```typescript
 * const tokens = getAvailableTokens({
 *   collection: mySchema,
 *   user: currentUser,
 *   siteConfig: publicConfig
 * });
 * ```
 */
export function getAvailableTokens(
	context: TokenContext,
	options: GetTokensOptions = {}
): TokenDefinition[] {
	const {
		scope,
		checkPermissions = false,
		includeSystem = true,
		search
	} = options;
	
	let tokens: TokenDefinition[] = [];
	
	// Determine which scopes to include
	const scopes: TokenScope[] = scope 
		? (Array.isArray(scope) ? scope : [scope])
		: ['entry', 'collection', 'site', 'user', 'system'];
	
	// Gather tokens from each scope
	if (scopes.includes('system') && includeSystem) {
		tokens.push(...getSystemTokens());
	}
	
	if (scopes.includes('user')) {
		tokens.push(...getUserTokens(context));
	}
	
	if (scopes.includes('site')) {
		tokens.push(...getSiteTokens(context));
	}
	
	if (scopes.includes('collection')) {
		tokens.push(...getCollectionTokens(context));
	}
	
	if (scopes.includes('entry')) {
		tokens.push(...getEntryTokens(context));
	}
	
	// Filter by search query
	if (search) {
		const searchLower = search.toLowerCase();
		tokens = tokens.filter(
			(token) =>
				token.key.toLowerCase().includes(searchLower) ||
				token.label.toLowerCase().includes(searchLower) ||
				token.description?.toLowerCase().includes(searchLower)
		);
	}
	
	// Filter by permissions if needed
	if (checkPermissions) {
		// TODO: Implement permission checking based on user context
		// For now, filter out tokens that require permissions we can't verify
		tokens = tokens.filter((token) => !token.requiresPermission);
	}
	
	return tokens;
}

/**
 * Get tokens grouped by scope
 */
export function getTokensByScope(
	context: TokenContext,
	options: GetTokensOptions = {}
): Record<TokenScope, TokenDefinition[]> {
	const allTokens = getAvailableTokens(context, options);
	
	const grouped: Record<TokenScope, TokenDefinition[]> = {
		entry: [],
		collection: [],
		site: [],
		user: [],
		system: []
	};
	
	for (const token of allTokens) {
		grouped[token.scope].push(token);
	}
	
	return grouped;
}

/**
 * Find a specific token definition by key
 */
export function findToken(
	key: string,
	context: TokenContext
): TokenDefinition | undefined {
	const allTokens = getAvailableTokens(context);
	return allTokens.find((token) => token.key === key);
}
