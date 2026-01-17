/**
 * @file src/widgets/scanner.ts
 * @description Centralized widget scanner using Vite's import.meta.glob.
 * Provides a single source of truth for widget discovery to avoid redundant scanning.
 */
import type { WidgetModule } from './types';
export declare const coreModules: Record<string, WidgetModule>;
export declare const customModules: Record<string, WidgetModule>;
export declare const allWidgetModules: {
	[x: string]: WidgetModule;
};
/**
 * Extracts widget name from file path
 * @param path - The file path (e.g., './core/input/index.ts')
 * @returns The widget name (e.g., 'input')
 */
export declare function getWidgetNameFromPath(path: string): string | null;
//# sourceMappingURL=scanner.d.ts.map
