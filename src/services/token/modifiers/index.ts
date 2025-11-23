/**
 * @file src/services/token/modifiers/index.ts
 * @description Modifier Registry and Core Modifiers
 *
 * This file exports the modifier registry and provides all built-in modifiers
 * for the token system.
 */

import type { ModifierFunction } from '../types';
import { textModifiers } from './text';
import { dateModifiers } from './date';
import { logicalModifiers } from './logical';
import { advancedModifiers } from './advanced';
import { mathModifiers } from './math';
import { pathModifiers } from './path';

/**
 * Registry of all available modifiers
 */
export const modifierRegistry = new Map<string, ModifierFunction>();

// Register text modifiers
textModifiers.forEach((modifier) => {
	modifierRegistry.set(modifier.name, modifier.fn);
});

// Register date modifiers
dateModifiers.forEach((modifier) => {
	modifierRegistry.set(modifier.name, modifier.fn);
});

// Register logical modifiers
logicalModifiers.forEach((modifier) => {
	modifierRegistry.set(modifier.name, modifier.fn);
});

// Register advanced modifiers
advancedModifiers.forEach((modifier) => {
	modifierRegistry.set(modifier.name, modifier.fn);
});

// Register math modifiers
mathModifiers.forEach((modifier) => {
	modifierRegistry.set(modifier.name, modifier.fn);
});

// Register path modifiers
pathModifiers.forEach((modifier) => {
	modifierRegistry.set(modifier.name, modifier.fn);
});

/**
 * Get all registered modifier names
 */
export function getRegisteredModifiers(): string[] {
	return Array.from(modifierRegistry.keys());
}

/**
 * Check if a modifier is registered
 */
export function hasModifier(name: string): boolean {
	return modifierRegistry.has(name);
}

/**
 * Register a custom modifier
 */
export function registerModifier(name: string, fn: ModifierFunction): void {
	modifierRegistry.set(name, fn);
}

