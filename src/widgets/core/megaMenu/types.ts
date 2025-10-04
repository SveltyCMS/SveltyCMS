/**
 * @file src/widgets/core/megamenu/types.ts
 * @description Type definitions for the MegaMenu widget
 *
 * @features
 * - **Strongly Typed**: Defines a clear structure for menu levels and their fields.
 * - **Nested Schema**: The `fields` property allows for defining different widgets at each menu depth
 * - **Permissions**: Role-based access control for menu operations.
 * - **Aggregations**: Filtering and sorting capabilities for menu data.
 * - **Advanced Configuration**: Support for complex menu hierarchies.
 */

import type { Permission } from '@src/databases/auth/types';
import type { FieldInstance } from '@src/content/types';

// Defines the properties unique to the MegaMenu widget
export interface MegaMenuProps {
	/**
	 * Defines the fields available at each level of the menu
	 * Example: `[[TextWidget({label:'Lvl 1'})], [TextWidget({label:'Lvl 2'})]]`
	 */
	fields: FieldInstance[][];

	// Maximum depth allowed for menu nesting @default: 5 levels deep
	maxDepth?: number;

	// Whether to enable drag-and-drop reordering @default: true
	enableDragDrop?: boolean;

	// Whether to show expand/collapse controls @default: true
	enableExpandCollapse?: boolean;

	// Custom validation rules for menu structure
	validationRules?: MenuValidationRules;
}

// Validation rules for menu structure
export interface MenuValidationRules {
	// Minimum number of root level items required
	minRootItems?: number;

	// Maximum number of root level items allowed
	maxRootItems?: number;

	// Maximum number of children per parent item
	maxChildrenPerParent?: number;

	// Whether to require unique titles within the same level
	requireUniqueTitles?: boolean;
}

/**
 * Defines the recursive structure for a single menu item
 * This is the shape of the data that will be stored
 */
export interface MenuItem {
	_id: string; // A unique ID for each item for stable rendering and DND.
	_fields: Record<string, unknown>; // The actual content data for the item.
	children: MenuItem[]; // Nested child items.
	_expanded?: boolean; // UI state for expand/collapse (not persisted).
}

// Extended menu item with additional metadata for advanced operations
export interface ExtendedMenuItem extends MenuItem {
	// Parent reference for tree operations
	parent?: ExtendedMenuItem;

	//Depth level in the hierarchy
	level: number;

	// Index within parent's children array
	index: number;

	// Whether this item can be dragged
	draggable?: boolean;

	// Whether this item can accept drops
	droppable?: boolean;
}

// Drag and drop event detail structure
export interface DragDropEventDetail {
	// Index of the target position
	targetIndex: number;

	// The dragged menu item
	draggedItem: MenuItem;

	// Whether dropping as a child of the target
	asChild: boolean;

	// Source level for validation
	sourceLevel: number;

	// Target level for validation
	targetLevel: number;
}

// Menu editing context for modal operations
export interface MenuEditContext {
	// The menu item being edited
	item: MenuItem;

	// Current nesting level
	level: number;

	// Available fields for this level
	fields: FieldInstance[];

	// Whether this is a new item creation
	isNew: boolean;

	// Parent item reference
	parent?: MenuItem;

	// Callback to save changes
	onSave: (data: Record<string, unknown>) => void;

	// Callback to cancel editing
	onCancel: () => void;
}

// Menu operation permissions
export interface MenuPermissions {
	// Can create new menu items
	canCreate: boolean;

	// Can edit existing menu items
	canEdit: boolean;

	// Can delete menu items
	canDelete: boolean;

	// Can reorder menu items via drag-and-drop
	canReorder: boolean;

	// Can expand/collapse menu sections
	canToggle: boolean;
}

// Aggregation configuration for menu data
export interface MenuAggregations {
	// Filter menu items by criteria
	filters: {
		// Filter by title content
		title?: string;

		// Filter by nesting level
		level?: number;

		// Filter by parent item ID
		parentId?: string;

		// Custom filter predicates
		custom?: (item: MenuItem) => boolean;
	};

	// Sort menu items
	sorts: {
		// Sort field name
		field: string;

		// Sort direction
		direction: 'asc' | 'desc';

		// Whether to sort recursively
		recursive: boolean;
	};
}

// Menu widget configuration schema
export interface MegaMenuConfig {
	// Widget properties
	props: MegaMenuProps;

	// Permission settings
	permissions?: Permission[];

	// Aggregation settings
	aggregations?: MenuAggregations;

	// Display options
	display?: {
		// Whether to show item counts
		showCounts?: boolean;

		// Whether to show hierarchy lines
		showLines?: boolean;

		// Custom CSS classes
		classes?: string;
	};
}
