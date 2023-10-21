// MegaMenu - allows multilevel menus for navigation
import MegaMenu from './MegaMenu.svelte';
import Text from '../text';

import { writable, type Writable } from 'svelte/store';
import { getGuiFields } from '@src/utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';
// import { defaultContentLanguage } from '@src/stores/store';

// typesafe-i18n
// import { get } from 'svelte/store';
// import LL from '@src/i18n/i18n-svelte.js';

export const currentChild: Writable<any> = writable({});

// Define the widget function
const widget = (params: Params) => {
	// Define the display function
	let display: any;

	if (!params.display) {
		display = async ({ data, contentLanguage }) => {
			// console.log(data);
			// Return the data for the default content language
			return data.Header[contentLanguage];
		};
		display.default = true;
	} else {
		display = params.display;
	}

	for (const level of params.menu) {
		level.unshift(Text({ label: 'Header', translated: true }));
	}
	params.menu.unshift([Text({ label: 'Header', translated: true })]);

	// Define the widget object
	const widget: { type: typeof MegaMenu; key: 'MegaMenu'; GuiFields: ReturnType<typeof getGuiFields> } = {
		type: MegaMenu,
		key: 'MegaMenu',
		GuiFields: getGuiFields(params, GuiSchema)
	};

	// Define the field object
	const field = {
		display,
		label: params.label,
		db_fieldName: params.db_fieldName,
		menu: params.menu
	};

	// Return the field and widget objects
	return { ...field, widget };
};

// Assign GuiSchema and GraphqlSchema to the widget function
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

// Export FieldType interface and widget function
export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
