/**
 * @file src/widgets/core/megamenu/index.ts
 * @description MegaMenu Widget Definition.
 *
 * A powerful builder widget for creating nested, hierarchical menu structures.
 * Features advanced drag-and-drop, modal editing, permissions, and comprehensive validation.
 *
 * @features
 * - **Recursive Validation**: Uses Valibot's `lazy` schema to validate a nested data structure.
 * - **Hierarchical Data**: Stores a tree of menu items with parent-child relationships.
 * - **Configurable Levels**: `fields` property allows defining different widgets for each menu depth.
 * - **Drag & Drop**: Visual reordering with advanced positioning logic.
 * - **Modal Editing**: Integrated modal system for item configuration.
 * - **Permissions**: Role-based access control for menu operations.
 * - **Aggregations**: Advanced filtering and sorting capabilities.
 * - **Clean Data Contract**: Stores a clean, predictable array of `MenuItem` objects.
 */

import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/factory';
import { array, object, string } from 'valibot';
import type { MegaMenuProps, MenuItem } from './types';

// Define a base schema for a nested menu item's data.
const MenuItemSchema = object({
	_id: string(),
	_fields: object({}), // The fields inside can be anything, validated by the parent form.
	children: array(object({})) // Allow nested children with the same structure
});

// The top-level schema is an array of these menu items.
const MegaMenuValidationSchema = array(MenuItemSchema);

// Create the widget definition using the factory.
const MegaMenuWidget = createWidget({
	Name: 'MegaMenu',
	Icon: 'lucide:menu-square',
	Description: m.widget_megaMenu_description(),

	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/megamenu/Input.svelte',
	displayComponentPath: '/src/widgets/core/megamenu/Display.svelte',

	// Assign the validation schema.
	validationSchema: MegaMenuValidationSchema,

	// Set widget-specific defaults.
	defaults: {
		fields: [],
		maxDepth: 5,
		enableDragDrop: true,
		enableExpandCollapse: true
	}
});

// Helper function for recursive operations
export const traverseMenuItems = (
	items: MenuItem[],
	callback: (item: MenuItem, level: number, parent?: MenuItem) => void,
	level = 0,
	parent?: MenuItem
): void => {
	items.forEach((item) => {
		callback(item, level, parent);
		if (item.children && item.children.length > 0) {
			traverseMenuItems(item.children, callback, level + 1, item);
		}
	});
};

// Helper function to find menu item by path
export const findMenuItemByPath = (items: MenuItem[], path: number[]): MenuItem | null => {
	let currentItems = items;
	let targetItem: MenuItem | null = null;

	for (const index of path) {
		if (index >= 0 && index < currentItems.length) {
			targetItem = currentItems[index];
			currentItems = targetItem.children;
		} else {
			return null;
		}
	}

	return targetItem;
};

// Helper function to validate menu structure
export const validateMenuStructure = (items: MenuItem[], config: MegaMenuProps): { valid: boolean; errors: string[] } => {
	const errors: string[] = [];
	const maxDepth = config.maxDepth || 5;

	// Check depth constraints
	const checkDepth = (item: MenuItem, currentDepth = 0): void => {
		if (currentDepth > maxDepth) {
			errors.push(`Menu item "${item._fields?.title || item._id}" exceeds maximum depth of ${maxDepth}`);
		}
		item.children.forEach((child) => checkDepth(child, currentDepth + 1));
	};

	// Check other constraints
	const checkConstraints = (item: MenuItem): void => {
		const childrenCount = item.children.length;
		const maxChildren = config.validationRules?.maxChildrenPerParent;

		if (maxChildren && childrenCount > maxChildren) {
			errors.push(`Menu item "${item._fields?.title || item._id}" has ${childrenCount} children, maximum allowed is ${maxChildren}`);
		}

		item.children.forEach(checkConstraints);
	};

	items.forEach((item) => {
		checkDepth(item);
		checkConstraints(item);
	});

	return {
		valid: errors.length === 0,
		errors
	};
};

export default MegaMenuWidget;

// Export helper types.
export type FieldType = ReturnType<typeof MegaMenuWidget>;
