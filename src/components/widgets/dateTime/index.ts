import DateTime from './DateTime.svelte';

import { type Params, GuiSchema } from './types';
import { defaultContentLanguage } from '@src/stores/store';

// typesafe-i18n
import { get } from 'svelte/store';
import LL from '@src/i18n/i18n-svelte.js';

const widget = ({
	label,
	db_fieldName,
	display,
	translated = false, // default no translation
	icon,
	// extras
	required
}: Params) => {
	if (!display) {
		display = async ({
			data,
			collection,
			field,
			entry,
			contentLanguage
		}: {
			data: any;
			collection: any;
			field: any;
			entry: any;
			contentLanguage: string;
		}) => {
			// console.log(data);
			data = data ? data : {}; // data can only be undefined if entry exists in db but this field was not set.
			return translated
				? data[contentLanguage] || get(LL).ENTRYLIST_Untranslated()
				: data[defaultContentLanguage] || get(LL).ENTRYLIST_Untranslated();
		};
		display.default = true;
	}

	const widget: { type: any; key: 'DateTime' } = { type: DateTime, key: 'DateTime' };

	const field = {
		display,
		schema: { [db_fieldName || label]: { String: String } },
		label,
		db_fieldName,
		translated,
		icon,
		// extras
		required
	};

	return { ...field, widget };
};

widget.GuiSchema = GuiSchema;

export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
