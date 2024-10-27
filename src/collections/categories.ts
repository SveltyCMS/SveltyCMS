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
	id: string;
	icon: string;
	name: string;
	subcategories?: Record<string, CategoryData>;
}

// Auto-generated category configuration
export const categoryConfig: Record<string, CategoryData> = {
	Collections: {
		id: 'cat_01',
		icon: 'bi:collection',
		name: 'Collections',
		subcategories: {
			Posts: {
				id: 'cat_02',
				icon: 'bi:folder',
				name: 'Posts',
				subcategories: {
					Posts: {
						id: 'cat_03',
						icon: 'bi:file-text',
						name: 'Posts'
					}
				}
			},
			Media: {
				id: 'cat_04',
				icon: 'bi:image',
				name: 'Media'
			},
			Names: {
				id: 'cat_05',
				icon: 'bi:person',
				name: 'Names'
			},
			Relation: {
				id: 'cat_06',
				icon: 'bi:link',
				name: 'Relation'
			},
			WidgetTest: {
				id: 'cat_07',
				icon: 'bi:grid',
				name: 'Widget Test'
			},
			ImageArray: {
				id: 'cat_08',
				icon: 'bi:images',
				name: 'Image Array'
			}
		}
	},
	Menu: {
		id: 'cat_09',
		icon: 'bi:list',
		name: 'Menu'
	}
};
