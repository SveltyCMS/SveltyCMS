/**
 * @file src/services/token/types.ts
 * @description Type definitions for the Token System
 *
 * This file defines the core types for the token system, including:
 * - TokenDefinition: Describes available tokens
 * - ModifierDefinition: Describes available modifiers
 * - TokenContext: Data available for token replacement
 */

import type { FieldInstance, Schema } from '@src/content/types';
import type { User } from '@src/databases/auth/types';

/**
 * Token categories for grouping in the UI
 */
export type TokenCategory = 'entry' | 'collection' | 'site' | 'user' | 'system';

/**
 * Token definition - describes an available token
 */
export interface TokenDefinition {
	/** The token string (e.g., "entry.title", "collection.name") */
	token: string;
	/** Display name for the token */
	name: string;
	/** Description of what the token represents */
	description: string;
	/** Category for grouping in UI */
	category: TokenCategory;
	/** Example value (for preview) */
	example?: string;
	/** Whether this token requires specific permissions */
	requiresPermission?: string;
	/** The actual path to access the value (e.g., ["entry", "title"]) */
	path: string[];
}

/**
 * Modifier definition - describes an available modifier function
 */
export interface ModifierDefinition {
	/** The modifier name (e.g., "upper", "slugify") */
	name: string;
	/** Display name */
	displayName: string;
	/** Description of what the modifier does */
	description: string;
	/** Category for grouping */
	category: 'text' | 'date' | 'logical' | 'image' | 'relational';
	/** Function signature description */
	signature: string;
	/** Example usage */
	example: string;
	/** Whether this modifier accepts parameters */
	acceptsParams: boolean;
	/** Parameter description (if acceptsParams is true) */
	paramDescription?: string;
}

/**
 * Context data available for token replacement
 */
export interface TokenContext {
	/** Current entry data (if editing an entry) */
	entry?: Record<string, unknown>;
	/** Collection schema */
	collection?: Schema;
	/** Current user */
	user?: User;
	/** Site configuration (public settings) */
	site?: Record<string, unknown>;
	/** System globals (e.g., now, timestamp, date, time, year, month, day, hour, minute, second) */
	system?: {
		now: Date;
		timestamp?: number;
		date?: string;
		time?: string;
		year?: number;
		month?: number;
		day?: number;
		hour?: number;
		minute?: number;
		second?: number;
		[key: string]: unknown;
	};
	/** Additional custom context */
	[key: string]: unknown;
}

/**
 * Token replacement result
 */
export interface TokenReplacementResult {
	/** The processed template with tokens replaced */
	result: string;
	/** Tokens that were successfully replaced */
	replaced: string[];
	/** Tokens that failed to resolve */
	failed: string[];
	/** Warnings (e.g., deprecated tokens) */
	warnings: string[];
}

/**
 * Modifier function type
 */
export type ModifierFunction = (
	value: unknown,
	params?: string[]
) => string | Promise<string>;

/**
 * Token registry configuration
 */
export interface TokenRegistryConfig {
	/** Whether to include entry tokens */
	includeEntry?: boolean;
	/** Whether to include collection tokens */
	includeCollection?: boolean;
	/** Whether to include site tokens */
	includeSite?: boolean;
	/** Whether to include user tokens */
	includeUser?: boolean;
	/** Whether to include system tokens */
	includeSystem?: boolean;
	/** Custom token definitions */
	customTokens?: TokenDefinition[];
	/** Custom modifier definitions */
	customModifiers?: ModifierDefinition[];
}

