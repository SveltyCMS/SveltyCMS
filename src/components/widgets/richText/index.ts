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

widget.modifyRequest = async ({ data, type, collection, id, meta_data }: ModifyRequestParams<typeof widget>) => {
	switch (type) {
		case 'POST':
		case 'PATCH':
			let images = data.get().images;
			let _data = data.get().data;
			let _id;

			for (const id of (_data.content['en'] as string).matchAll(/media_image="(.+?)"/gms)) {
				// Images from richtext content itself
				images[id[1]] = new mongoose.Types.ObjectId(id[1]);
			}

			for (const img_id in images) {
				if (images[img_id] instanceof File) {
					// Locally selected new images
					const res = await saveImage(images[img_id], collection.name);
					const fileInfo = res.fileInfo;
					_id = res.id;
					for (const lang in _data.content) {
						_data.content[lang] = _data.content[lang].replace(`src="${img_id}"`, `src="${fileInfo.original.url}" media_image="${_id}"`);
					}
				} else {
					// Selected from Media images
					_id = new mongoose.Types.ObjectId(images[img_id]);
				}
				if (meta_data?.media_images?.removed && _id) {
					const removed = meta_data?.media_images?.removed as string[];
					let index = removed.indexOf(_id.toString());

					while (index != -1) {
						removed.splice(index, 1);
						index = removed.indexOf(_id.toString());
					}
				}

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
