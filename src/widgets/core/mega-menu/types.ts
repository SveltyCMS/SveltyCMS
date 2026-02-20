/**
 * @file src/widgets/core/MegaMenu/types.ts
 * @description Type definitions for the MegaMenu widget
 *
 * @features
 * - **Strongly Typed**: Defines a clear structure for menu levels and their fields.
 * - **Nested Schema**: The `fields` property allows for defining different widgets at each menu depth
 * - **Permissions**: Role-based access control for menu operations.
 * - **Aggregations**: Filtering and sorting capabilities for menu data.
 * - **Advanced Configuration**: Support for complex menu hierarchies.
 */

import type { FieldInstance } from '@src/content/types';
import type { Permission } from '@src/databases/auth/types';

// Defines the properties unique to the MegaMenu widget
export interface MegaMenuProps {
	// Whether to enable drag-and-drop reordering @default: true
	enableDragDrop?: boolean;

	// Whether to show expand/collapse controls @default: true
	enableExpandCollapse?: boolean;
	/**
	 * Defines the fields available at each level of the menu
	 * Example: `[[TextWidget({label:'Lvl 1'})], [TextWidget({label:'Lvl 2'})]]`
	 */
	fields: FieldInstance[][];

	// Maximum depth allowed for menu nesting @default: 5 levels deep
	maxDepth?: number;

	// Custom validation rules for menu structure
	validationRules?: MenuValidationRules;

	// Index signature to satisfy WidgetProps constraint
	[key: string]: unknown;
}

// Validation rules for menu structure
export interface MenuValidationRules {
	// Maximum number of children per parent item
	maxChildrenPerParent?: number;

	// Maximum number of root level items allowed
	maxRootItems?: number;
	// Minimum number of root level items required
	minRootItems?: number;

	// Whether to require unique titles within the same level
	requireUniqueTitles?: boolean;
}

/**
 * Defines the recursive structure for a single menu item
 * This is the shape of the data that will be stored
 */
export interface MenuItem {
	_expanded?: boolean; // UI state for expand/collapse (not persisted).
	_fields: Record<string, unknown>; // The actual content data for the item.
	_id: string; // A unique ID for each item for stable rendering and DND.
	children: MenuItem[]; // Nested child items.
}

// Extended menu item with additional metadata for advanced operations
export interface ExtendedMenuItem extends MenuItem {
	// Whether this item can be dragged
	draggable?: boolean;

	// Whether this item can accept drops
	droppable?: boolean;

	// Index within parent's children array
	index: number;

	//Depth level in the hierarchy
	level: number;
	// Parent reference for tree operations
	parent?: ExtendedMenuItem;
}

// Drag and drop event detail structure
export interface DragDropEventDetail {
	// Whether dropping as a child of the target
	asChild: boolean;

	// The dragged menu item
	draggedItem: MenuItem;

	// Source level for validation
	sourceLevel: number;
	// Index of the target position
	targetIndex: number;

	// Target level for validation
	targetLevel: number;
}

// Menu editing context for modal operations
export interface MenuEditContext {
	// Available fields for this level
	fields: FieldInstance[];

	// Whether this is a new item creation
	isNew: boolean;
	// The menu item being edited
	item: MenuItem;

	// Current nesting level
	level: number;

	// Callback to cancel editing
	onCancel: () => void;

	// Callback to save changes
	onSave: (data: Record<string, unknown>) => void;

	// Parent item reference
	parent?: MenuItem;
}

// Menu operation permissions
export interface MenuPermissions {
	// Can create new menu items
	canCreate: boolean;

	// Can delete menu items
	canDelete: boolean;

	// Can edit existing menu items
	canEdit: boolean;

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

	// Permission settings
	permissions?: Permission[];
	// Widget properties
	props: MegaMenuProps;
}
