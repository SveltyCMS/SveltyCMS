/**
 * @file src/collections/categories.ts
 * @description Category configuration generated from folder structure
 *
 * ⚠️ WARNING: This is an auto-generated file.
 * DO NOT MODIFY DIRECTLY - Changes will be overwritten by the CMS.
 *
 * This file is generated from:
 * 1. Folder structure in src/collections/
 * 2. GUI updates via /api/save-categories
 * 3. System updates via /api/updateCategories
 *
 * Translations are stored in the database, not in this file.
 */

interface CategoryData {
	icon: string;
	name: string;
	subcategories?: Record<string, CategoryData>;
}

// Auto-generated category configuration
export const categoryConfig: Record<string, CategoryData> = {
	Collections: {
		icon: 'bi:collection',
		name: 'Collections',
		subcategories: {
			Posts: {
				icon: 'bi:folder',
				name: 'Posts',
				subcategories: {
					Posts: {
						icon: 'bi:file-text',
						name: 'Posts'
					}
				}
			},
			Media: {
				icon: 'bi:image',
				name: 'Media'
			},
			Names: {
				icon: 'bi:person',
				name: 'Names'
			},
			Relation: {
				icon: 'bi:link',
				name: 'Relation'
			},
			WidgetTest: {
				icon: 'bi:grid',
				name: 'Widget Test'
			},
			ImageArray: {
				icon: 'bi:images',
				name: 'Image Array'
			}
		}
	},
	Menu: {
		icon: 'bi:list',
		name: 'Menu'
	}
};
