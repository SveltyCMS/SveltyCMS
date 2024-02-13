// Components
import Input from '@components/system/inputs/Input2.svelte';
import GuiFields from '@components/widgets/megaMenu/GuiFields.svelte';
// import Toggles from '@components/system/inputs/Toggles.svelte';

import widgets from '..';
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
	translated?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Widget Specific parameters
	menu: any[]; // Make sure this is always an array of arrays
};

export interface CustomDragEvent extends Event {
	detail: {
		closest_index: number;
		clone_index: number;
		dragged_item: any;
		isParent: boolean;
	};
}

/**
 * Defines MegaMenu GuiSchema
 */
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	// Widget Specific parameters
	menu: { widget: GuiFields, required: true }
};

/**
 * Define MegaMenu GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = ({ field, collection }) => {
	const menu = field.menu;
	const typeName = `${collection.name}_${getFieldName(field, true)}`;
	const types = new Set();
	let levelCount = 0;
	for (const level of menu) {
		const children: Array<any> = [];
		for (const _field of level) {
			types.add(widgets[_field.widget.key].GraphqlSchema({ label: `${getFieldName(_field, true)}_Level${levelCount}`, collection }).graphql);
			if (levelCount > 0) {
				children.push(`${getFieldName(_field, true)}:${collection.name}_${getFieldName(_field, true)}_Level${levelCount} `);
			}
		}
		if (levelCount > 0) {
			if (menu.length - levelCount > 1) {
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
