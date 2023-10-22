import Input from '@src/components/system/inputs/Input2.svelte';
// import Toggles from '@src/components/system/inputs/Toggles.svelte';
// import { contentLanguage } from '@src/stores/store';
import GuiFields from '@src/components/widgets/megaMenu/GuiFields.svelte';
import widgets from '..';
import { getFieldName } from '@src/utils/utils';

export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	translated?: boolean;
	icon?: string;
	helper?: string;

	// Widget Specific parameters
	menu: any[]; // Make sure this is always an array of arrays
};

// Define the GuiSchema
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	// Widget Specific parameters
	menu: { widget: GuiFields, required: true }
};

// Define the GraphqlSchema function
export const GraphqlSchema: GraphqlSchema = ({ field, label, collection }) => {
	const menu = field.menu;
	const typeName = `${collection.name}_${getFieldName(field)}`;
	const types = new Set();
	
	let levelCount = 0;
	
	for (const level of menu) {
		const children: Array<any> = [];
		for (const _field of level) {
			types.add(widgets[_field.widget.key].GraphqlSchema({ label: `${getFieldName(_field)}_Level${levelCount}`, collection }).graphql);
			if (levelCount > 0) {
				children.push(`${getFieldName(_field)}:${collection.name}_${getFieldName(_field)}_Level${levelCount} `);
			}
		}
		if (levelCount > 0) {
			if (menu.length - levelCount > 1) {
				children.push(`children:[${collection.name}_${getFieldName(field)}_Level${levelCount + 1}] `);
			}
			types.add(`
			type ${collection.name}_${getFieldName(field)}_Level${levelCount} {
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
			children: [${collection.name}_${getFieldName(field)}_Level1]
		}
	`
	};
};
