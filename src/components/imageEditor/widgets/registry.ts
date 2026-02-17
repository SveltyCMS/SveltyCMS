/**
 * @file src/components/imageEditor/widgets/registry.ts
 * @description Dynamic widget registry with validation and type safety
 *
 * Features:
 * - Auto-discovery of widgets via import.meta.glob
 * - Runtime validation of widget structure
 * - Ordering/categorization support
 * - Development mode warnings
 */
import type { Component } from 'svelte';

export interface EditorWidget {
	category?: string; // 'adjust' | 'transform' | 'annotate' | 'effects'
	controls?: Component<any>;
	description?: string;
	disabled?: boolean;
	experimental?: boolean;
	icon?: string;
	key: string;
	order?: number; // For custom ordering
	// Metadata for conditional features
	requiresImage?: boolean;
	title: string;
	tool: Component<any>;
}

// Type guard for widget validation
function isValidWidget(obj: unknown): obj is EditorWidget {
	if (!obj || typeof obj !== 'object') {
		return false;
	}
	const widget = obj as Partial<EditorWidget>;

	return !!(widget.key && typeof widget.key === 'string' && widget.title && typeof widget.title === 'string' && widget.tool);
}

// Load all widgets from PascalCase folders
const modules = import.meta.glob('./[A-Z]*/index.ts', { eager: true }) as Record<string, { default?: EditorWidget; editorWidget?: EditorWidget }>;

// Process and validate widgets
export const editorWidgets: EditorWidget[] = Object.entries(modules)
	.map(([path, module]) => {
		const widget = module.default ?? module.editorWidget;

		if (!widget) {
			if (import.meta.env.DEV) {
				console.warn(`[Widget Registry] No widget export found in ${path}`);
			}
			return null;
		}

		if (!isValidWidget(widget)) {
			if (import.meta.env.DEV) {
				console.error(`[Widget Registry] Invalid widget structure in ${path}:`, widget);
			}
			return null;
		}

		// Set defaults
		return {
			requiresImage: true,
			experimental: false,
			disabled: false,
			category: 'general',
			order: 999,
			...widget
		} as EditorWidget;
	})
	.filter((w): w is EditorWidget => w !== null)
	.filter((w) => !w.disabled) // Filter out disabled widgets
	.sort((a, b) => {
		// Sort by order, then by title
		if (a.order !== b.order) {
			return (a.order ?? 999) - (b.order ?? 999);
		}
		return a.title.localeCompare(b.title);
	});

/**
 * Get widgets by category
 */
export function getWidgetsByCategory(category: string): EditorWidget[] {
	return editorWidgets.filter((w) => w.category === category);
}

/**
 * Get widget by key
 */
export function getWidgetByKey(key: string): EditorWidget | undefined {
	return editorWidgets.find((w) => w.key === key);
}

/**
 * Get all available categories
 */
export function getCategories(): string[] {
	const categories = new Set(editorWidgets.map((w) => w.category ?? 'general'));
	return Array.from(categories).sort();
}

/**
 * Check if a widget is available (not disabled, not experimental in production)
 */
export function isWidgetAvailable(widget: EditorWidget): boolean {
	if (widget.disabled) {
		return false;
	}
	if (widget.experimental && !import.meta.env.DEV) {
		return false;
	}
	return true;
}

// Development mode logging
if (import.meta.env.DEV) {
	console.log('[Widget Registry] Loaded widgets:', editorWidgets.length);
	console.table(
		editorWidgets.map((w) => ({
			key: w.key,
			title: w.title,
			category: w.category,
			order: w.order,
			experimental: w.experimental
		}))
	);
}

// Export count for external use
export const widgetCount = editorWidgets.length;
