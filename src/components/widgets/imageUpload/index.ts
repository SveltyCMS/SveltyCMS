import ImageUpload from './ImageUpload.svelte';

import { getFieldName, getGuiFields, get_elements_by_id, saveImage } from '@src/utils/utils';
import { type Params, GuiSchema, GraphqlSchema } from './types';
import type { ModifyRequestParams } from '..';
import mongoose from 'mongoose';

//ParaglideJS
import * as m from '@src/paraglide/messages';
import type { MediaImage } from '@src/utils/types';

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
	const widget: { type: typeof ImageUpload; key: 'ImageUpload'; GuiFields: ReturnType<typeof getGuiFields> } = {
		type: ImageUpload,
		key: 'ImageUpload',
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
		path: params.path || 'unique'
	};

	// Return the field and widget objects
	return { ...field, widget };
};

// Assign GuiSchema and GraphqlSchema to the widget function
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;

// Widget modifyRequest
widget.modifyRequest = async ({ data, type, collection, id }: ModifyRequestParams<typeof widget>) => {
	const _data = data.get() as File | MediaImage;

	switch (type) {
		case 'GET':
			// Here _data is just id of the image
			get_elements_by_id.add('media_images', _data, (newData) => data.update(newData));
			break;
		case 'POST':
		case 'PATCH':
			if (_data instanceof File) {
				console.log(_data);
				const _id = await saveImage(_data, collection.name);
				type === 'PATCH' && (await mongoose.models['media_images'].updateMany({ _id: _data.oldID }, { $pull: { used_by: id } }));
				await mongoose.models['media_images'].updateOne({ _id }, { $addToSet: { used_by: id } }, { upsert: true });
				data.update(_id);
			} else {
				// Chosen image from media_images
				const _id = new mongoose.Types.ObjectId(_data._id);
				type === 'PATCH' && (await mongoose.models['media_images'].updateMany({ _id: _data.oldID }, { $pull: { used_by: id } }));
				await mongoose.models['media_images'].updateOne({ _id }, { $addToSet: { used_by: id } }, { upsert: true });
				data.update(_id);
			}
			break;
		case 'DELETE':
			await mongoose.models['media_images'].updateMany({ used_by: id }, { $pull: { used_by: id } });
			break;
	}
};

// Widget icon and helper text
widget.Icon = 'material-symbols:image-outline';
widget.Description = m.widget_ImageUpload_description();

// Widget Aggregations:
widget.aggregations = {
	filters: async (info) => {
		const field = info.field as ReturnType<typeof widget>;

		return [{ $match: { [`${getFieldName(field)}.original.name`]: { $regex: info.filter, $options: 'i' } } }];
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
