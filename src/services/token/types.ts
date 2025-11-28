/*
 * @file src/services/token/types.ts
 * @description Core type definitions for the Token System
 *
 * @param {Schema, FieldInstance} - The schema and field instance types.
 * @param {User} - The user type.
 *
 * Features:
 * - Resolves tokens in JSON API responses.
 * - Only processes JSON API responses for collection endpoints.
 * - Clones response body to avoid modifying the original response.
 * - Processes the response body with tokens.
 * - Returns the processed response.
 */

import type { Schema } from '@src/content/types';
import type { User } from '@src/databases/auth/types';

export type TokenCategory = 'entry' | 'collection' | 'site' | 'user' | 'system' | 'recentlyUsed';

export interface TokenContext {
	/** The content entry currently being processed */
	entry?: Record<string, any>;
	/** The schema definition for the current collection */
	collection?: Schema;
	/** The authenticated user (used for permission checks and user tokens) */
	user?: User;
	/** Global site configuration (publicEnv) */
	site?: Record<string, any>;
	/** System globals (time, version) */
	system?: {
		now: Date;
		[key: string]: any;
	};
	/** Allow arbitrary context for custom extensions */
	[key: string]: any;
}

export interface TokenDefinition {
	token: string; // e.g. "entry.title"
	name: string; // e.g. "Post Title"
	description: string; // Human readable description
	category: TokenCategory;
	example?: string;
	requiresPermission?: string;
	/** Optimized O(1) resolver function */
	resolve: (context: TokenContext) => any;
}

export type ModifierFunction = (value: unknown, params?: string[]) => string | Promise<string>;

export interface TokenReplaceOptions {
	/** Max recursion depth to prevent infinite loops (default: 10) */
	maxDepth?: number;
	/** If true, leaves {{token}} in the string if not found (useful for debugging) */
	preserveUnresolved?: boolean;
	/** If true, throws an error when a token cannot be resolved */
	throwOnMissing?: boolean;
}

export interface TokenRegistryConfig {
	includeEntry?: boolean;
	includeCollection?: boolean;
	includeSite?: boolean;
	includeUser?: boolean;
	includeSystem?: boolean;
	customTokens?: TokenDefinition[];
}
