/**
 * @file src/services/tokens/types.ts
 * @description Type definitions for the SveltyCMS Token System
 * 
 * This file defines the core types for the token replacement system that allows
 * content editors to insert dynamic, contextual data into input fields using
 * a simple {{token}} syntax.
 */

import type { Schema, FieldInstance, CollectionEntry } from '@src/content/types';

/**
 * Represents the scope/category of a token
 */
export type TokenScope = 'entry' | 'collection' | 'site' | 'user' | 'system';

/**
 * Context available during token replacement
 */
export interface TokenContext {
	/** Current entry data (for entry.* tokens) */
	entry?: CollectionEntry;
	
	/** Collection schema (for collection.* tokens) */
	collection?: Schema;
	
	/** Collection name/ID */
	collectionName?: string;
	
	/** Site-wide configuration (for site.* tokens) */
	siteConfig?: Record<string, unknown>;
	
	/** Current user data (for user.* tokens) */
	user?: {
		id?: string;
		email?: string;
		name?: string;
		role?: string;
		[key: string]: unknown;
	};
	
	/** Content language for translated fields */
	contentLanguage?: string;
	
	/** Tenant ID for multi-tenant support */
	tenantId?: string;
	
	/** Additional custom context data */
	[key: string]: unknown;
}

/**
 * Function that modifies a token value
 * @param value - The value to modify
 * @param params - Optional parameters for the modifier
 * @returns The modified value
 */
export type ModifierFunction = (value: unknown, params?: string[]) => string;

/**
 * Definition of a token modifier (e.g., uppercase, lowercase, truncate)
 */
export interface ModifierDefinition {
	/** Unique identifier for the modifier */
	name: string;
	
	/** Human-readable description */
	description: string;
	
	/** The function that performs the modification */
	execute: ModifierFunction;
	
	/** Optional parameters the modifier accepts */
	parameters?: Array<{
		name: string;
		description: string;
		required: boolean;
		type: 'string' | 'number' | 'boolean';
	}>;
	
	/** Example usage */
	example?: string;
}

/**
 * Definition of an available token
 */
export interface TokenDefinition {
	/** Full token path (e.g., "entry.title", "site.name") */
	key: string;
	
	/** Token scope/category */
	scope: TokenScope;
	
	/** Human-readable label for UI display */
	label: string;
	
	/** Description of what this token represents */
	description?: string;
	
	/** Data type of the token value */
	type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
	
	/** Whether this token requires specific permissions to use */
	requiresPermission?: string;
	
	/** Whether this token is available in the current context */
	available: boolean;
	
	/** Preview value for UI display */
	previewValue?: string;
	
	/** Field instance if this token represents a field */
	field?: FieldInstance;
}

/**
 * Options for token replacement
 */
export interface TokenReplacementOptions {
	/** Whether to throw on missing tokens (default: false - return empty string) */
	throwOnMissing?: boolean;
	
	/** Whether to preserve unresolved tokens (default: false - replace with empty) */
	preserveUnresolved?: boolean;
	
	/** Custom error handler for token resolution errors */
	onError?: (error: Error, token: string) => void;
	
	/** Maximum depth for nested token resolution */
	maxDepth?: number;
}

/**
 * Result of token replacement operation
 */
export interface TokenReplacementResult {
	/** The final replaced string */
	result: string;
	
	/** List of tokens that were successfully replaced */
	replaced: string[];
	
	/** List of tokens that could not be resolved */
	unresolved: string[];
	
	/** Any errors encountered during replacement */
	errors: Array<{
		token: string;
		message: string;
	}>;
}

/**
 * Options for getting available tokens
 */
export interface GetTokensOptions {
	/** Filter tokens by scope */
	scope?: TokenScope | TokenScope[];
	
	/** Filter tokens by permission requirements */
	checkPermissions?: boolean;
	
	/** Include system tokens */
	includeSystem?: boolean;
	
	/** Search query to filter tokens */
	search?: string;
}
