/**
 * @file src/collections/categories.ts
 * @description Category configuration generated from folder structure
 *
 * ⚠️ WARNING: This is an auto-generated file.
 * DO NOT MODIFY DIRECTLY - Changes will be overwritten by the CMS.
 *
 * This file is generated from:
 * 1. Folder structure in config/collections/
 * 2. GUI & System updates via src/routes/api/categories
 *
 * Translations are stored in the database, not in this file.
 */

import type { CategoryData } from './types';

// Auto-generated category configuration
export const categoryConfig: Record<string, CategoryData> = {
	Collections: {
		id: 'c1',
		icon: 'bi:folder',
		name: 'Collections',
		subcategories: {
			Posts: {
				id: 'c1.1',
				icon: 'bi:folder',
				name: 'Posts',
				subcategories: {
					Posts: {
						id: 'c1.1.1',
						icon: 'bi:file-text',
						name: 'Posts',
						isCollection: true
					}
				}
			},
			Media: {
				id: 'c1.2',
				icon: 'bi:image',
				name: 'Media',
				isCollection: true
			},
			Names: {
				id: 'c1.3',
				icon: 'bi:person',
				name: 'Names',
				isCollection: true
			},
			Relation: {
				id: 'c1.4',
				icon: 'bi:link',
				name: 'Relation',
				isCollection: true
			},
			WidgetTest: {
				id: 'c1.5',
				icon: 'bi:grid',
				name: 'Widget Test',
				isCollection: true
			},
			ImageArray: {
				id: 'c1.6',
				icon: 'bi:images',
				name: 'Image Array',
				isCollection: true
			}
		}
	},
	Menu: {
		id: 'c2',
		icon: 'bi:folder',
		name: 'Menu',
		subcategories: {
			Menu: {
				id: 'c2.1',
				icon: 'bi:list',
				name: 'Menu',
				isCollection: true
			}
		}
	}
};
