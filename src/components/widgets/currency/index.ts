import Currency from './Currency.svelte';

import { getGuiFields } from '@src/utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';
import { defaultContentLanguage } from '@src/stores/store';

// typesafe-i18n
import { get } from 'svelte/store';
import LL from '@src/i18n/i18n-svelte.js';

// Define the widget function
const widget = (params: Params) => {
	// Define the display function
	let display: any;

	if (!params.display) {
		display = async ({ data }) => {
			// console.log(data);
			data = data ? data : {}; // Ensure data is not undefined
			// Return the data for the default content language or a message indicating no data entry
			return data[defaultContentLanguage] || get(LL).ENTRYLIST_Untranslated();
		};
		display.default = true;
	} else {
		display = params.display;
	}

	// Define the widget object
	const widget: { type: typeof Currency; key: 'Currency'; GuiFields: ReturnType<typeof getGuiFields> } = {
		type: Currency,
		key: 'Currency',
		GuiFields: getGuiFields(params, GuiSchema)
	};

	// Define the field object
	const field = {
		// default fields
		display,
		label: params.label,
		db_fieldName: params.db_fieldName,
		icon: params.icon,
		translated: params.translated,
		helper: params.helper,

		// extras
		readonly: params.readonly,
		required: params.required,
		minlength: params.minlength,
		maxlength: params.maxlength,
		prefix: params.prefix,
		suffix: params.suffix,
		placeholder: params.placeholder,
		step: params.step,
		count: params.count,
		negative: params.negative,
		currencyCode: params.currencyCode,
		width: params.width
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
