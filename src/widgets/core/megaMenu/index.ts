/**
 * @file src/widgets/core/megamenu/index.ts
 * @description MegaMenu Widget Definition.
 *
 * A powerful builder widget for creating nested, hierarchical menu structures.
 * Each level of the menu can be configured with its own set of widgets.
 *
 * @features
 * - **Recursive Validation**: Uses Valibot's `lazy` schema to validate a nested data structure.
 * - **Hierarchical Data**: Stores a tree of menu items with parent-child relationships.
 * - **Configurable Levels**: `fields` property allows defining different widgets for each menu depth.
 * - **Clean Data Contract**: Stores a clean, predictable array of `MenuItem` objects.
 */

import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/factory';
import { any, array, lazy, minLength, object, string, type Input } from 'valibot';
import type { MegaMenuProps } from './types';

// Define a base schema for a single menu item's data.
const MenuItemSchema = object({
	_id: string([minLength(1)]),
	_fields: any(), // The fields inside can be anything, validated by the parent form.
	children: lazy(() => array(MenuItemSchema)) // Recursively validate children.
});

// The top-level schema is an array of these menu items.
const MegaMenuValidationSchema = array(MenuItemSchema);

// Create the widget definition using the factory.
const MegaMenuWidget = createWidget<MegaMenuProps, typeof MegaMenuValidationSchema>({
	Name: 'MegaMenu',
	Icon: 'lucide:menu-square',
	Description: m.widget_megaMenu_description(),

	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/megamenu/Input.svelte',
	displayComponentPath: '/src/widgets/core/megamenu/Display.svelte',

	// Assign the recursive validation schema.
	validationSchema: MegaMenuValidationSchema,

	// Set widget-specific defaults.
	defaults: {
		fields: []
	},

	// Aggregation searches on a primary field of the top-level menu item.
	aggregations: {
		filters: async ({ field, filter, contentLanguage }) => {
			// This is a simplified filter; real-world might need a more complex recursive search.
			const primaryField = field.fields?.[0]?.[0]?.db_fieldName || 'title';
			return [{ $match: { [`0._fields.${primaryField}.${contentLanguage}`]: { $regex: filter, $options: 'i' } } }];
		}
	}
});

export default MegaMenuWidget;

// Export helper types.
export type FieldType = ReturnType<typeof MegaMenuWidget>;
export type MegaMenuWidgetData = Input<typeof MegaMenuValidationSchema>;
