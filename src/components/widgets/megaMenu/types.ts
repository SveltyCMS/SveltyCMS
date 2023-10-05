import Input from '@src/components/system/inputs/Input.svelte';
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

	// Widget Specific parameters
	menu: any[]; // Make sure this is always an array of arrays
};

export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	// Widget Specific parameters
	menu: { widget: GuiFields, required: true }
};

export const GraphqlSchema = ({ field, label, collection }) => {
	const menu = field.menu;

	const types = new Set();
	let levelCount = 0;

	// Check if menu is iterable
	if (Array.isArray(menu)) {
		for (const level of menu) {
			const children: Array<any> = [];

			// Check if level is iterable
			if (Array.isArray(level)) {
				for (const _field of level) {
					types.add(widgets[_field.widget.key].GraphqlSchema({ label: `${getFieldName(_field)}_Level${levelCount}`, collection }));
					if (levelCount > 0) {
						children.push(`${getFieldName(_field)}:${collection.name}_${getFieldName(_field)}_Level${levelCount} `);
					}
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
	}

	return /* GraphQL */ `
		${Array.from(types).join('\n')}
		type ${collection.name}_${getFieldName(field)} {
			Header: ${collection.name}_Header_Level0
			children: [${collection.name}_${getFieldName(field)}_Level1]
		}
	`;
};
