import Input from '@src/components/system/inputs/Input.svelte';
import GuiFields from '@src/components/widgets/megaMenu/GuiFields.svelte';
import widgets from '..';

export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	schema?: { [Key: string]: any };
	translated?: boolean;
	// Widget Specific parameters
	menu: any[];
};

export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	// Widget Specific parameters
	menu: { widget: GuiFields, required: true }
};

export const GraphqlSchema = ({ collection, field }) => {
	const menu = field.menu;

	const types = new Set();
	let levelCount = 0;
	for (const level of menu) {
		const children: Array<any> = [];
		for (const _field of level) {
			types.add(widgets[_field.widget.key].GraphqlSchema({}));
			if (levelCount > 0) {
				children.push(`${_field.label}:${_field.widget.key} `);
			}
		}
		if (levelCount > 0) {
			if (menu.length - levelCount > 1) {
				children.push(`children:[${field.label}_Level${levelCount + 1}] `);
			}
			types.add(`
			type ${field.label}_Level${levelCount} {
				${Array.from(children).join('\n')}
			}
			`);
		}
		levelCount++;
	}

	return /* GraphQL */ `
		${Array.from(types).join('\n')}
		type MegaMenu {
			Header: Text
			children: [${field.label}_Level1]
		}
	`;
};
