import ImageUpload from './ImageUpload.svelte';

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
	path = 'unique'
}: Params) => {
	if (!display) {
		display = async ({ data, collection, field, entry, contentLanguage }) => {
			return `<img class='max-w-[200px] inline-block' src="${data?.thumbnail.url}" />`;
		};
		display.default = true;
	}

	const widget: { type: any; key: 'ImageUpload' } = { type: ImageUpload, key: 'ImageUpload' };

	const field = {
		// standard
		label,
		db_fieldName,
		display,
		icon,
		translated,

		// extras
		required,
		path
	};

	return { ...field, widget };
};

widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
