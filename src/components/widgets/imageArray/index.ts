const WIDGET_NAME = 'ImageArray' as const;

import ImageUpload from '../imageUpload';

import { getFieldName, getGuiFields } from '@utils/utils';
import type { Params as ImageUpload_Params } from '../imageUpload/types';
import { type Params, GuiSchema, GraphqlSchema } from './types';

import type { ModifyRequestParams } from '..';
import widgets from '..';

//ParaglideJS
import * as m from '@src/paraglide/messages';

/**
 * Defines ImageArray widget Parameters
 */
const widget = (params: Params) => {
	params.fields.unshift(
		ImageUpload({
			db_fieldName: params.uploader_db_fieldName,
			label: params.uploader_label,
			display: params.uploader_display,
			path: params.uploader_path
		})
	);

	const uploader = params.fields[0] as ImageUpload_Params;

	// Define the display function
	let display: any;

	if (!params.display) {
		display = async ({ entry }) => {
			return `<img class='max-w-[200px] inline-block' src="${entry[getFieldName(uploader)]?.thumbnail?.url}" />`;
		};
		display.default = true;
	} else {
		display = params.display;
	}

	// Define the widget object
	const widget = {
		Name: WIDGET_NAME,
		GuiFields: getGuiFields(params, GuiSchema)
	};

	// Define the field object
	const field = {
		// default fields
		display,
		label: params.label,
		db_fieldName: params.db_fieldName,
		// translated: params.translated,
		required: params.required,
		icon: params.icon,
		width: params.width,
		helper: params.helper,

		// permissions
		permissions: params.permissions,

		// extra fields
		upload: true,
		fields: params.fields,
		uploader_label: params.uploader_label,
		uploader_path: params.uploader_path,
		uploader_display: params.uploader_display,
		uploader_db_fieldName: params.uploader_db_fieldName,
		extract: true
	};

	// Return the field and widget objects
	return { ...field, widget };
};

widget.modifyRequest = async ({ field, data, user, type, id, collection, meta_data }: ModifyRequestParams<typeof widget>) => {
	const _data = data.get();
	console.log('data:', _data);
	return;
	for (const _field of field.fields) {
		const widget = widgets[_field.widget.Name];
		if ('modifyRequest' in widget) {
			await widget.modifyRequest({
				collection,
				field: _field as ReturnType<typeof widget>,
				data: _data[getFieldName(_field)],
				user,
				type,
				id
			});
		}
	}
};

// Assign Name, GuiSchema and GraphqlSchema to the widget function
widget.Name = WIDGET_NAME;
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

// Widget icon and helper text
widget.Icon = 'bi:images';
widget.Description = m.widget_ImageArray_description();

// Export FieldType interface and widget function
export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
