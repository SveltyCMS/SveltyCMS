/**
@file src/components/widgets/imageArray/index.ts
@description - imageArray index file.
*/

const WIDGET_NAME = 'ImageArray' as const;

import ImageUpload from '../imageUpload';

import { getFieldName, getGuiFields } from '@utils/utils';
import type { Params as ImageUpload_Params } from '../imageUpload/types';
import { type Params, type DISPLAY, GuiSchema, GraphqlSchema } from './types';

import type { ModifyRequestParams } from '..';

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
			folder: params.uploader_path
		})
	);

	const uploader = params.fields[0] as ImageUpload_Params;

	// Define the display function
	const display: DISPLAY =
		params.display ??
		(async ({ entry }) => {
			const thumbnailUrl = entry[getFieldName(uploader)]?.thumbnail?.url;
			return thumbnailUrl ? `<img class='max-w-[200px] inline-block' src="${thumbnailUrl}" />` : '';
		});

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

widget.modifyRequest = async ({ field, data, user, type, id, collection }: ModifyRequestParams<typeof widget>) => {
	const _data = data.get();
	console.log('data:', _data);

	// Process each field
	for (const _field of field.fields) {
		// Get the widget instance directly from the field
		const widgetInstance = _field.widget;
		if (widgetInstance?.modifyRequest) {
			await widgetInstance.modifyRequest({
				collection,
				field: _field,
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
widget.toString = () => '';

// Widget icon and helper text
widget.Icon = 'bi:images';
widget.Description = m.widget_ImageArray_description();

// Export widget function
export default widget;
