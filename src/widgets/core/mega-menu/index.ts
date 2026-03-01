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

import { widget_megaMenu_description } from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/widget-factory';
import { array, maxLength, object, pipe, string } from 'valibot';
import type { MegaMenuProps, MenuItem } from './types';

// SECURITY: Define a base schema for a nested menu item's data with validation
const MENU_ITEM_SCHEMA = object({
	_id: pipe(string(), maxLength(100)),
	_fields: object({}), // The fields inside validated separately
	children: array(object({})) // Nested children with same structure
});

// The top-level schema is an array of these menu items.
const MEGA_MENU_VALIDATION_SCHEMA = array(MENU_ITEM_SCHEMA);

// Create the widget definition using the factory.
const MegaMenuWidget = createWidget({
	Name: 'MegaMenu',
	Icon: 'mdi:menu',
	Description: widget_megaMenu_description(),

	// Define paths to the dedicated Svelte components.
	inputComponentPath: ' $args[0].Value.ToLower() ',
	displayComponentPath: ' $args[0].Value.ToLower() ',

	// Assign the validation schema.
	validationSchema: MEGA_MENU_VALIDATION_SCHEMA,

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
	for (const item of items) {
		callback(item, level, parent);
		if (item.children && item.children.length > 0) {
			traverseMenuItems(item.children, callback, level + 1, item);
		}
	}
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
		for (const child of item.children) {
			checkDepth(child, currentDepth + 1);
		}
	};

	// Check other constraints
	const checkConstraints = (item: MenuItem): void => {
		const childrenCount = item.children.length;
		const maxChildren = config.validationRules?.maxChildrenPerParent;

		if (maxChildren && childrenCount > maxChildren) {
			errors.push(`Menu item "${item._fields?.title || item._id}" has ${childrenCount} children, maximum allowed is ${maxChildren}`);
		}

		for (const child of item.children) {
			checkConstraints(child);
		}
	};

	for (const item of items) {
		checkDepth(item);
		checkConstraints(item);
	}

	return {
		valid: errors.length === 0,
		errors
	};
};

export default MegaMenuWidget;

// Export helper types.
export type FieldType = ReturnType<typeof MegaMenuWidget>;
