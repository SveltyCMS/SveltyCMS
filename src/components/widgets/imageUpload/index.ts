const WIDGET_NAME = 'ImageUpload' as const;

import type { MediaImage } from '@src/utils/types';

import { getFieldName, getGuiFields, get_elements_by_id, meta_data, saveImage } from '@src/utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';
import { type ModifyRequestParams } from '..';
import mongoose from 'mongoose';

//ParaglideJS
import * as m from '@src/paraglide/messages';

/**
 * Defines ImageUpload widget Parameters
 */
const widget = (params: Params) => {
	// Define the display function
	let display: any;

	if (!params.display) {
		display = async ({ data }) => {
			// console.log(data);

			// Return the formatted data
			let url = data?.thumbnail?.url;

			if (data instanceof FileList) {
				url = URL.createObjectURL(data[0]);
			} else if (data instanceof File) {
				url = URL.createObjectURL(data);
			}

			return `<img class='max-w-[200px] inline-block' src="${url}" />`;
		};
		display.default = true;
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
		permissions: params.permissions,

		// extras
		path: params.path || 'unique',
		multiupload: params.multiupload,
		sizelimit: params.sizelimit,
		extensions: params.extensions,
		watermark: {
			url: params.watermark?.url,
			position: params.watermark?.position,
			opacity: params.watermark?.opacity,
			scale: params.watermark?.scale,
			offsetX: params.watermark?.offsetX,
			offsetY: params.watermark?.offsetY
		}
	};

	// Return the field and widget objects
	return { ...field, widget };
};

// Assign Name, GuiSchema and GraphqlSchema to the widget function
widget.Name = WIDGET_NAME;
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

// Widget icon and helper text
widget.Icon = 'material-symbols:image-outline';
widget.Description = m.widget_ImageUpload_description();

// Widget modifyRequest
widget.modifyRequest = async ({ data, type, collection, id }: ModifyRequestParams<typeof widget>) => {
	const _data = data.get() as File | MediaImage;
	let _id: any; // Declare the variable outside the switch

	switch (type) {
		case 'GET':
			// here _data is just id of the image
			data.update(null);
			get_elements_by_id.add('media_images', _data, (newData) => data.update(newData));
			break;
		case 'POST':
		case 'PATCH':
			if (_data instanceof File) {
				_id = (await saveImage(_data, collection.name)).id;
				data.update(_id);
			} else if (_data?._id) {
				//chosen image from _media_images
				_id = new mongoose.Types.ObjectId(_data._id);
				data.update(_id);
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
			break;
		case 'DELETE':
			await mongoose.models['media_images'].updateMany({}, { $pull: { used_by: id } });
			break;
	}
};

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
		return [{ $sort: { [`${fieldName}.original.name`]: info.sort } }];
	}
} as Aggregations;

// Export FieldType interface and widget function
export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
