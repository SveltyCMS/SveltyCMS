/**
 * @file src/services/token/types.ts
 * @description Core type definitions for the Token System
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
import type { ISODateString, Schema } from '@src/content/types';
import type { User } from '@src/databases/auth/types';

export type TokenCategory = 'entry' | 'collection' | 'site' | 'user' | 'system' | 'recentlyUsed';
export type TokenType = 'string' | 'number' | 'date' | 'boolean' | 'any';

export interface TokenContext {
	collection?: Schema;
	entry?: Record<string, unknown>;
	locale?: string;
	roles?: import('@src/databases/auth/types').Role[];
	site?: Record<string, unknown>;
	system?: { now: ISODateString; [key: string]: unknown };
	tenantId?: string;
	user?: User;
	[key: string]: unknown;
}

export interface TokenDefinition {
	category: TokenCategory;
	description: string;
	example?: string;
	name: string;
	requiresPermission?: string;
	resolve: (context: TokenContext) => unknown | Promise<unknown>;
	token: string;
	type: TokenType; // New: Helps UI suggest relevant modifiers
}

// --- Modifier Metadata for UI ---
export interface ModifierArg {
	default?: string | number | boolean;
	description?: string;
	name: string;
	options?: string[]; // For select type
	type: 'text' | 'number' | 'select' | 'boolean';
}

export interface ModifierMetadata {
	accepts: TokenType[]; // Which token types can use this?
	args: ModifierArg[];
	description: string;
	label: string;
	name: string;
}

export type ModifierFunction = (value: unknown, params?: string[]) => string | Promise<string>;

export interface TokenRegistryConfig {
	customTokens?: TokenDefinition[];
	includeCollection?: boolean;
	includeEntry?: boolean;
	includeSite?: boolean;
	includeSystem?: boolean;
	includeUser?: boolean;
	locale?: string;
	roles?: import('@src/databases/auth/types').Role[];
	tenantId?: string;
}

export interface TokenReplaceOptions {
	maxDepth?: number;
	preserveUnresolved?: boolean;
	throwOnMissing?: boolean;
}
