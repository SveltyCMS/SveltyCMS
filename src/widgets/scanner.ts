/**
 * @file src/widgets/scanner.ts
 * @description Centralized widget scanner using Vite's import.meta.glob.
 * Provides a single source of truth for widget discovery to avoid redundant scanning.
 */

import type { WidgetModule } from './types';

// Scan for core widgets
export const coreModules = import.meta.glob<WidgetModule>('./core/*/index.ts', {
	eager: true
});

// Scan for custom widgets
export const customModules = import.meta.glob<WidgetModule>('./custom/*/index.ts', {
	eager: true
});

// Combined modules for easier iteration
export const allWidgetModules = { ...coreModules, ...customModules };

/**
 * Extracts widget name from file path
 * @param path - The file path (e.g., './core/input/index.ts')
 * @returns The widget name (e.g., 'input')
 */
export function getWidgetNameFromPath(path: string): string | null {
	const parts = path.split('/');
	return parts.at(-2) || null;
}
