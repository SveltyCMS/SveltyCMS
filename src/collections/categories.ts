/**
 * @file src/collections/categories.ts
 * @description Defines the configuration for collection categories including icons and order
 */

interface CategoryConfig {
	icon: string;
	order: number;
	subcategories?: Record<string, CategoryConfig>;
}

// Configuration for collection categories
// Lower order numbers appear first
export const categoryConfig: Record<string, CategoryConfig> = {
	Collections: {
		icon: 'bi:collection',
		order: 10,
		subcategories: {
			Posts: {
				icon: 'bi:file-text',
				order: 11
			},
			Media: {
				icon: 'bi:image',
				order: 12
			}
		}
	},
	Menu: {
		icon: 'bi:list',
		order: 20
	}
};

// Helper function to get full category path configuration
export function getCategoryConfig(path: string): CategoryConfig | undefined {
	const segments = path.split('/');
	let current = categoryConfig[segments[0]];

	for (let i = 1; i < segments.length; i++) {
		if (!current?.subcategories?.[segments[i]]) {
			return undefined;
		}
		current = current.subcategories[segments[i]];
	}

	return current;
}

// Helper function to flatten category config for backward compatibility
export function flattenCategoryConfig(): Record<string, CategoryConfig> {
	const flattened: Record<string, CategoryConfig> = {};

	function flatten(config: Record<string, CategoryConfig>, prefix = '') {
		for (const [key, value] of Object.entries(config)) {
			const fullPath = prefix ? `${prefix}/${key}` : key;
			flattened[fullPath] = {
				icon: value.icon,
				order: value.order
			};

			if (value.subcategories) {
				flatten(value.subcategories, fullPath);
			}
		}
	}

	flatten(categoryConfig);
	return flattened;
}
