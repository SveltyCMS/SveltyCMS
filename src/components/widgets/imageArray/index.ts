// ImageArray - allows multiple image upload with editor
import ImageArray from './ImageArray.svelte';
import ImageUpload from '../imageUpload';

import { getFieldName } from '@src/utils/utils.js';

import type { Params as ImageUpload_Params } from '../imageUpload/types';
import { type Params, GuiSchema, GraphqlSchema } from './types';

const widget = ({
	// Accept parameters from collection
	label,
	db_fieldName,
	display,
	icon,
	translated = false,

	// extras
	required,
	fields,
	uploader_label,
	uploader_path,
	uploader_display,
	uploader_db_fieldName
	
}: Params) => {
	fields.unshift(ImageUpload({ db_fieldName: uploader_db_fieldName, label: uploader_label, display: uploader_display, path: uploader_path }));
	const uploader = fields[0] as ImageUpload_Params;

	if (!display) {
		display = async ({ data, collection, field, entry, contentLanguage }) => {
			return `<img class='max-w-[200px] inline-block' src="${entry[getFieldName(uploader)].thumbnail.url}" />`;
		};
		display.default = true;
	}

	const widget: { type: any; key: 'ImageArray' } = { type: ImageArray, key: 'ImageArray' };

	const field = {
		// standard
		label,
		db_fieldName,
		display,
		icon,
		translated,

		// extras
		required,
		upload: true,
		fields,
		extract: true
	};

	return { ...field, widget };
};

widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

export interface FieldType extends ReturnType<typeof widget> {}
export default widget;

