/**
 * @file src/services/token/index.ts
 * @description Token System - Main Export File
 *
 * This file exports all public APIs for the token system, making it easy
 * for developers to use and extend the token functionality.
 */

// Core services
export { replaceTokens, replaceTokensSync } from './TokenService';
export {
	getAvailableTokens,
	getTokensByCategory,
	clearTokenCache
} from './TokenRegistry';

// Types
export type {
	TokenDefinition,
	ModifierDefinition,
	TokenCategory,
	TokenContext,
	TokenReplacementResult,
	TokenRegistryConfig,
	ModifierFunction
} from './types';

// Modifier registry (for custom modifiers)
export {
	modifierRegistry,
	getRegisteredModifiers,
	hasModifier,
	registerModifier
} from './modifiers';

// Utilities
export { getNestedValue, safeStringify } from './utils';

