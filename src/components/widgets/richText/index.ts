const WIDGET_NAME = 'RichText' as const;

import { publicEnv } from '@root/config/public';
import { getFieldName, getGuiFields, saveImage } from '@src/utils/utils';
import { GuiSchema, GraphqlSchema, type Params } from './types';
import mongoose from 'mongoose';
import type { ModifyRequestParams } from '..';

//ParaglideJS
import * as m from '@src/paraglide/messages';

/**
 * Defines RichText widget Parameters
 */
const widget = (params: Params) => {
	// Define the display function
	let display: any;

	if (!params.display) {
		display = async ({ data, contentLanguage }) => {
			// console.log(data);
			data = data ? data : {}; // Ensure data is not undefined
			// Return the data for the default content language or a message indicating no data entry
			return params.translated ? data[contentLanguage] || m.widgets_nodata() : data[publicEnv.DEFAULT_CONTENT_LANGUAGE] || m.widgets_nodata();
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
		translated: params.translated,
		required: params.required,
		icon: params.icon,
		width: params.width,
		helper: params.helper,

		// permissions
		permissions: params.permissions

		//extra
	};

	// Return the field and widget objects
	return { ...field, widget };
};

widget.modifyRequest = async ({ data, type, collection, id }: ModifyRequestParams<typeof widget>) => {
	switch (type) {
		case 'POST':
		case 'PATCH':
			let images = data.get().images;
			let _data = data.get().data;

			for (const id in images) {
				const { fileInfo, id: _id } = await saveImage(images[id], collection.name);
				for (const lang in _data.content) {
					_data.content[lang] = _data.content[lang].replace(id, fileInfo.original.url);
				}
				type === 'PATCH' && (await mongoose.models['media_images'].updateMany({}, { $pull: { used_by: id } }));
				await mongoose.models['media_images'].updateOne({ _id }, { $addToSet: { used_by: id } });
			}
			data.update(_data);
			break;
		case 'DELETE':
			console.log(id);
			await mongoose.models['media_images'].updateMany({ used_by: id }, { $pull: { used_by: id } });
			break;
	}
};

// Assign Name, GuiSchema and GraphqlSchema to the widget function
widget.Name = WIDGET_NAME;
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

// Widget icon and helper text
widget.Icon = 'icon-park-outline:text';
widget.Description = m.widget_text_description();

// Widget Aggregations:
widget.aggregations = {
	filters: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		return [
			{
				$match: {
					[`${getFieldName(field)}.header.${info.contentLanguage}`]: {
						$regex: info.filter,
						$options: 'i'
					}
				}
			}
		];
	},
	sorts: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const fieldName = getFieldName(field);
		return [{ $sort: { [`${fieldName}.${info.contentLanguage}`]: info.sort } }];
	}
} as Aggregations;

// Export FieldType interface and widget function
export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
