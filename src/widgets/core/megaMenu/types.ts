/**
@file src/widgets/core/megaMenu/types.ts
@description - megaMenu widget types
*/

// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';

// Auth
import type { Permission } from '@root/src/auth';

import widgets, { type WidgetType } from '../../index';
type Fields = ReturnType<WidgetType[keyof WidgetType]>[][];
import { getFieldName } from '@utils/utils';

/**
 * Defines MegaMenu widget Parameters
 */
export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: Record<string, unknown>;
	required?: boolean;
	translated?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Permissions
	permissions?: Permission[];

	// Widget Specific parameters
	fields: Fields; // Make sure this is always an array of arrays
};

/**
 * Defines MegaMenu GuiSchema
 */
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	required: { widget: Toggles, required: false },
	translated: { widget: Toggles, required: false },
	icon: { widget: IconifyPicker, required: false },
	helper: { widget: Input, required: false },
	width: { widget: Input, required: false },

	// Permissions
	permissions: { widget: PermissionsSetting, required: false },

	// Widget Specific parameters - Use Input for now to avoid circular dependency
	fields: { widget: Input, required: true }
};

/**
 * Define MegaMenu GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = ({ field, label, collection }) => {
	const fields = field.fields;
	const typeID = label; // Use the clean label passed from collections resolver
	const types = new Set();
	let levelCount = 0;

	for (const level of fields) {
		const children: string[] = [];

		for (const _field of level) {
			try {
				const fieldSchema = widgets[_field.widget.Name].GraphqlSchema?.({
					field: _field,
					label: `${label}_${getFieldName(_field)}_Level${levelCount}`, // Use clean label
					collection
				});
				if (fieldSchema) {
					types.add(fieldSchema.graphql);
					if (levelCount > 0) {
						children.push(`${getFieldName(_field)}:${fieldSchema.typeID}`); // Use sanitized field name
					}
				} else {
					console.warn(`No GraphQL schema found for field: ${getFieldName(_field)}`);
				}
			} catch (error) {
				console.error(`Error generating GraphQL schema for field ${getFieldName(_field)}:`, error);
			}
		}

		if (levelCount > 0) {
			if (fields.length - levelCount > 1) {
				children.push(`children:[${label}_Level${levelCount + 1}]`); // Use clean label
			}
			try {
				types.add(` type ${label}_Level${levelCount} { ${Array.from(children).join('\n')} } `); // Use clean label
			} catch (error) {
				console.error(`Error generating GraphQL type for level ${levelCount}:`, error);
			}
		}
		levelCount++;
	}

	// Return an object containing the type name and the GraphQL schema

	try {
		const graphql = /* GraphQL */ `
		${Array.from(types).join('\n')}
		type ${typeID} {
		  Header: ${label}_${getFieldName(fields[0][0])}_Level0
		  children: [${label}_Level1]
		}
	  `;
		return { typeID: typeID, graphql };
	} catch (error) {
		console.error('Error generating GraphQL schema:', error);
		return { typeID: typeID, graphql: '' };
	}
};

export type MegaMenuItem = {
	Header: Record<string, string>;
	children: MegaMenuItem[];
	[key: string]: string | number | boolean | MegaMenuItem[] | { [key: string]: string | number | boolean | MegaMenuItem[] };
};

export interface CustomDragEvent extends Event {
	detail: {
		closest_index: number;
		clone_index: number;
		dragged_item: MegaMenuItem;
		isParent: boolean;
		expanded_list: [boolean];
		refresh_expanded_list: () => void;
	};
}
