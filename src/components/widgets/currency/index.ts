import Currency from './Currency.svelte';

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
	currencyCode,
	placeholder,
	count,
	minlength,
	maxlength,
	step,
	negative,
	prefix,
	suffix,
	readonly,
	required,
	width
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
			data = data ? data : {}; // data can only be undefined if entry exists in db but this field was not set.
			return data[defaultContentLanguage] || get(LL).ENTRYLIST_Untranslated();
		};
		display.default = true;
	}

	const widget: { type: any; key: 'Currency' } = { type: Currency, key: 'Currency' };

	const field = {
		// standard
		label,
		db_fieldName,
		display,
		icon,
		translated,
		
		// extras
		currencyCode,
		placeholder,
		count,
		minlength,
		maxlength,
		step,
		negative,
		prefix,
		suffix,
		readonly,
		required,
		width
	};

	return { ...field, widget };
};

widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
