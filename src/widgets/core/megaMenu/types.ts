/**
 * @file src/widgets/core/megamenu/types.ts
 * @description Type definitions for the MegaMenu widget.
 *
 * @features
 * - **Strongly Typed**: Defines a clear structure for menu levels and their fields.
 * - **Nested Schema**: The `fields` property allows for defining different widgets at each menu depth.
 */
import type { FieldInstance } from '@src/content/types';

/**
 * Defines the properties unique to the MegaMenu widget.
 */
export interface MegaMenuProps {
	/**
	 * Defines the fields available at each level of the menu.
	 * Example: `[[TextWidget({label:'Lvl 1'})], [TextWidget({label:'Lvl 2'})]]`
	 */
	fields: FieldInstance[][];
}

/**
 * Defines the recursive structure for a single menu item.
 * This is the shape of the data that will be stored.
 */
export interface MenuItem {
	_id: string; // A unique ID for each item for stable rendering and DND.
	_fields: Record<string, any>; // The actual content data for the item.
	children: MenuItem[]; // Nested child items.
}
