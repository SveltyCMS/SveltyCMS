// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@src/components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import Permission from '@src/components/Permission.svelte';

// Auth
import type { AuthPermission } from '@src/auth/types';
import GuiFields from '@components/widgets/megaMenu/GuiFields.svelte';

import widgets, { type WidgetType } from '..';
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
	widget?: any;
	required?: boolean;
	translated?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Permissions
	permissions?: AuthPermission[];

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
	permissions: { widget: Permission, required: false },

	// Widget Specific parameters
	fields: { widget: GuiFields, required: true }
};

/**
 * Define MegaMenu GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = ({ field, collection }) => {
	const fields = field.fields;
	const typeName = `${collection.name}_${getFieldName(field, true)}`;
	const types = new Set();
	let levelCount = 0;

	for (const level of fields) {
		const children: Array<any> = [];

		for (const _field of level) {
			try {
				const fieldSchema = widgets[_field.widget.Name].GraphqlSchema?.({ label: `${getFieldName(_field, true)}_Level${levelCount}`, collection });
				if (fieldSchema) {
					types.add(fieldSchema.graphql);
					if (levelCount > 0) {
						children.push(`${getFieldName(_field, true)}:${fieldSchema.typeName}`);
					}
				} else {
					console.warn(`No GraphQL schema found for field: ${getFieldName(_field, true)}`);
				}
			} catch (error) {
				console.error(`Error generating GraphQL schema for field ${getFieldName(_field, true)}:`, error);
			}
		}

		if (levelCount > 0) {
			if (fields.length - levelCount > 1) {
				children.push(`children:[${collection.name}_${getFieldName(field, true)}_Level${levelCount + 1}]`);
			}
			try {
				types.add(` type ${collection.name}_${getFieldName(field, true)}_Level${levelCount} { ${Array.from(children).join('\n')} } `);
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
		type ${typeName} {
		  Header: ${collection.name}_Header_Level0
		  children: [${collection.name}_${getFieldName(field, true)}_Level1]
		}
	  `;
		return { typeName, graphql };
	} catch (error) {
		console.error('Error generating GraphQL schema:', error);
		return { typeName, graphql: '' };
	}
};

export interface CustomDragEvent extends Event {
	detail: {
		closest_index: number;
		clone_index: number;
		dragged_item: any;
		isParent: boolean;
		expanded_list: [boolean];
		refresh_expanded_list: () => void;
	};
}
