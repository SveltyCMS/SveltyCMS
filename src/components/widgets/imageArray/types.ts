import Input from '@src/components/system/inputs/Input2.svelte';
import Toggles from '@src/components/system/inputs/Toggles.svelte';

import { getFieldName } from '@src/utils/utils';
import widgets from '@src/components/widgets';

import IconifyPicker from '@src/components/IconifyPicker.svelte';

// Define the widget Parameters
export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	translated?: boolean;
	icon?: string;

	// Widget Specific parameters
	fields: any;
	required?: boolean;
	uploader_label: string;
	uploader_display?: DISPLAY;
	uploader_db_fieldName?: string;
	uploader_path: string;
};

// Define the GuiSchema
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	// translated: { widget: Toggles, required: false },
	icon: { widget: IconifyPicker, required: false },

	// Widget Specific parameters
	uploader_path: { widget: Input, required: true },
	uploader_label: { widget: Input, required: true },
	required: { widget: Toggles, required: false }
};

// Define the GraphqlSchema function
export const GraphqlSchema: GraphqlSchema = ({ field, collection }) => {
	let fieldTypes = '';
	for (const _field of field.fields) {
		fieldTypes += widgets[_field.widget.key].GraphqlSchema({ label: getFieldName(_field, true), collection }).graphql + '\n';
	}

	return {
		typeName: null, // imageArray does not have its own typeName in DB so its null. it unpacks fieldTypes directly
		graphql: /* GraphQL */ `
			${fieldTypes}
		`
	};
};
