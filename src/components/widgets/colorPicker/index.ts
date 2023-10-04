import ColorPicker from './ColorPicker.svelte';

import { type Params, GuiSchema, GraphqlSchema } from './types';
import { defaultContentLanguage } from '@src/stores/store';

// typesafe-i18n
import { get } from 'svelte/store';
import LL from '@src/i18n/i18n-svelte.js';

const widget = ({
	// Accept parameters from collection
	label,
	db_fieldName,
	display,
	icon,
	translated = false,

	// extras
	required
}: Params) => {
	if (!display) {
		display = async (data: any) => {
			data = data ? data : {}; // data can only be undefined if entry exists in db but this field was not set.
			return data[defaultContentLanguage] || get(LL).ENTRYLIST_Untranslated();
		};
		display.default = true;
	}

	const widget: { type: any; key: 'ColorPicker' } = { type: ColorPicker, key: 'ColorPicker' };

	const field = {
		// standard
		label,
		db_fieldName,
		display,
		icon,
		translated,
		
		// extras
		required
	};

	return { ...field, widget };
};

widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
