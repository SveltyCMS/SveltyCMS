/**
 * @file src/services/tokens/index.ts
 * @description Main entry point for the SveltyCMS Token System
 * 
 * This module exports all token-related functionality including:
 * - Token replacement (TokenService)
 * - Token discovery (TokenRegistry)
 * - Built-in modifiers
 * - Type definitions
 */

// Core services
export { replaceTokens, hasTokens, extractTokens, validateTokenSyntax } from './TokenService';
export { getAvailableTokens, getTokensByScope, findToken } from './TokenRegistry';

// Modifiers
export { builtInModifiers, getModifier, getAllModifiers, applyModifier } from './modifiers';

// Types
export type {
	TokenScope,
	TokenContext,
	ModifierFunction,
	ModifierDefinition,
	TokenDefinition,
	TokenReplacementOptions,
	TokenReplacementResult,
	GetTokensOptions
} from './types';
