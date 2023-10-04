// ImageArray - allows multiple image upload with editor
import ImageArray from './ImageArray.svelte';
import { getFieldName } from '@src/utils/utils.js';

import type { Params as ImageUpload_Params } from '../imageUpload/types';
import { type Params, GuiSchema, GraphqlSchema } from './types';

const widget = ({
	// Accept parameters from collection
	db_fieldName,
	icon,
	fields,
	required,
	label,
	display
}: Params) => {
	const uploader = fields[0] as ImageUpload_Params;

	if (!display) {
		display = async ({ data, collection, field, entry, contentLanguage }) => {
			return `<img class='max-w-[200px] inline-block' src="${entry[getFieldName(uploader)].thumbnail.url}" />`;
		};
		display.default = true;
	}

	const widget: { type: any; key: 'ImageArray' } = { type: ImageArray, key: 'ImageArray' };

	const field = {
		db_fieldName,
		label,
		icon,
		upload: true,
		fields,
		required,
		display
	};

	return { ...field, widget };
};

widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
