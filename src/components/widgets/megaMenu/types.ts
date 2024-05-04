// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@src/components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import Permission from '@src/components/Permission.svelte';

// Auth
import type { Permissions } from '@src/auth/types';
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
	permissions?: Permissions;

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
			types.add(
				widgets[_field.widget.Name].GraphqlSchema({
					label: `${getFieldName(_field, true)}_Level${levelCount}`,
					collection
				}).graphql
			);
			if (levelCount > 0) {
				children.push(`${getFieldName(_field, true)}:${collection.name}_${getFieldName(_field, true)}_Level${levelCount} `);
			}
		}

		if (levelCount > 0) {
			if (fields.length - levelCount > 1) {
				children.push(`children:[${collection.name}_${getFieldName(field, true)}_Level${levelCount + 1}] `);
			}
			types.add(`
			type ${collection.name}_${getFieldName(field, true)}_Level${levelCount} {
				${Array.from(children).join('\n')}
			}
			`);
		}
		levelCount++;
	}
	// Return an object containing the type name and the GraphQL schema
	return {
		typeName,
		graphql: /* GraphQL */ `
		${Array.from(types).join('\n')}
		type ${typeName} {
			Header: ${collection.name}_Header_Level0
			children: [${collection.name}_${getFieldName(field, true)}_Level1]
		}
	`
	};
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
