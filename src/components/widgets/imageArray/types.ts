import Input from '@src/components/system/inputs/Input2.svelte';
import Toggles from '@src/components/system/inputs/Toggles.svelte';

import { getFieldName } from '@src/utils/utils';
import widgets from '@src/components/widgets';

import type DefaultWidgets from '@src/components/widgets';

type Widgets = ReturnType<(typeof DefaultWidgets)[keyof typeof DefaultWidgets]>;
type Widgets2 = [...Widgets[]];

export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	translated?: boolean;
	icon?: string;

	// Widget Specific parameters
	imageUploadTitle: string;
	fields: Widgets2;
	required?: boolean;

	uploader_label: string;
	uploader_display?: DISPLAY;
	uploader_db_fieldName?: string;
	uploader_path: string;
};

export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	// widget?: any;
	// translated: { widget: Toggles, required: false },
	icon: { widget: Input, required: false },

	// Widget Specific parameters
	imageUploadTitle: { widget: Input, required: false },
	required: { widget: Toggles, required: false }
};

export const GraphqlSchema: GraphqlSchema = ({ field, label, collection }) => {
	let fieldTypes = '';
	for (const _field of field.fields) {
		fieldTypes += widgets[_field.widget.key].GraphqlSchema({ label: getFieldName(_field), collection }).graphql + '\n';
	}

	return {
		typeName: null, // imageArray does not have its own typeName in DB so its null. it unpacks fieldTypes directly
		graphql: /* GraphQL */ `
			${fieldTypes}
		`
	};
};
