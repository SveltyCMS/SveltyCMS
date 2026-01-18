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
import type { Schema, ISODateString } from '@cms-types/content';
import type { User } from '@shared/database/auth/types';

export type TokenCategory = 'entry' | 'collection' | 'site' | 'user' | 'system' | 'recentlyUsed';
export type TokenType = 'string' | 'number' | 'date' | 'boolean' | 'any';

export interface TokenContext {
	entry?: Record<string, any>;
	collection?: Schema;
	user?: User;
	site?: Record<string, any>;
	system?: { now: ISODateString; [key: string]: any };
	locale?: string;
	tenantId?: string;
	roles?: any[];
	[key: string]: any;
}

export interface TokenDefinition {
	token: string;
	name: string;
	description: string;
	category: TokenCategory;
	type: TokenType; // New: Helps UI suggest relevant modifiers
	example?: string;
	requiresPermission?: string;
	resolve: (context: TokenContext) => any | Promise<any>;
}

// --- Modifier Metadata for UI ---
export interface ModifierArg {
	name: string;
	type: 'text' | 'number' | 'select' | 'boolean';
	options?: string[]; // For select type
	default?: string | number | boolean;
	description?: string;
}

export interface ModifierMetadata {
	name: string;
	label: string;
	description: string;
	accepts: TokenType[]; // Which token types can use this?
	args: ModifierArg[];
}

export type ModifierFunction = (value: unknown, params?: string[]) => string | Promise<string>;

export interface TokenRegistryConfig {
	includeEntry?: boolean;
	includeCollection?: boolean;
	includeSite?: boolean;
	includeUser?: boolean;
	includeSystem?: boolean;
	customTokens?: TokenDefinition[];
	locale?: string;
	tenantId?: string;
	roles?: any[];
}

export interface TokenReplaceOptions {
	maxDepth?: number;
	preserveUnresolved?: boolean;
	throwOnMissing?: boolean;
}
