/**
 * @file src/components/widgets/imageUpload/index.ts
 * @description - imageUpload index file.
 */

const WIDGET_NAME = 'ImageUpload' as const; // Defines ImageUpload widget Parameters

import type { MediaImage } from '@utils/media/mediaModels'; // Updated import
import { getFieldName, getGuiFields, get_elements_by_id, meta_data } from '@utils/utils';
import { MediaService } from '@utils/media/MediaService'; // Import the MediaService class
import { type Params, GuiSchema, GraphqlSchema } from './types';
import { type ModifyRequestParams } from '..';
import { dbAdapter } from '@src/databases/db'; // Import your database adapter

// ParaglideJS
import * as m from '@src/paraglide/messages';

const mediaService = new MediaService(dbAdapter!);

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
			let url = data?.thumbnails?.default?.url || data?.url;

			if (data instanceof FileList) {
				url = URL.createObjectURL(data[0]);
			} else if (data instanceof File) {
				url = URL.createObjectURL(data);
			}

			if (params.type === 'video') {
				return `<video class='max-w-[200px] inline-block' src="${url}" controls></video>`;
			} else if (params.type === 'audio') {
				return `<audio class='max-w-[200px] inline-block' src="${url}" controls></audio>`;
			} else if (params.type === 'document') {
				return `<a class='max-w-[200px] inline-block' href="${url}" target="_blank">${data?.name || 'Document'}</a>`;
			} else {
				return `<img class='max-w-[200px] inline-block' src="${url}" />`;
			}
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
		folder: params.folder || 'unique',
		multiupload: params.multiupload,
		sizelimit: params.sizelimit,
		extensions: params.extensions,
		metadata: params.metadata,
		tags: params.tags,
		categories: params.categories,
		responsive: params.responsive,
		customDisplayComponent: params.customDisplayComponent,
		watermark: {
			url: params.watermark?.url,
			position: params.watermark?.position,
			opacity: params.watermark?.opacity,
			scale: params.watermark?.scale,
			offsetX: params.watermark?.offsetX,
			offsetY: params.watermark?.offsetY,
			rotation: params.watermark?.rotation
		}
	};

	// Return the field and widget objects
	return { ...field, widget };
};

// Assign Name, GuiSchema and GraphqlSchema to the widget function
widget.Name = WIDGET_NAME;
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;
widget.toString = () => '';

// Widget icon and helper text
widget.Icon = 'material-symbols:image-outline';
widget.Description = m.widget_ImageUpload_description();

// Widget modifyRequest
widget.modifyRequest = async ({ data, type, collection, id, user_id }: ModifyRequestParams<typeof widget> & { user_id: string }) => {
	const _data = data.get() as File | MediaImage | { id: string; fileInfo: MediaImage };
	let _id: string | undefined; // Declare the variable outside the switch

	if (!dbAdapter) {
		console.error('dbAdapter is null, cannot proceed.');
		return;
	}

	switch (type) {
		case 'GET':
			// Assuming `_data` is a string in this case
			if (typeof _data === 'string') {
				data.update(null);
				get_elements_by_id.add('media_images', _data, (newData) => data.update(newData));
			} else {
				console.error('Expected a string ID for GET, but received a different type.');
			}
			break;
		case 'POST':
		case 'PATCH':
			if (_data instanceof File) {
				// Pass `user_id` directly when calling `saveMedia`
				const result = await mediaService.saveMedia(_data, user_id); // Use MediaService to save media
				_id = result._id; // Use the saved media ID
				data.update(_id);
			} else if (_data && 'id' in _data) {
				// Assuming your object has `id` instead of `_id`
				_id = _data.id;
				data.update(_id);
			}
			if (meta_data?.media_images?.removed && _id) {
				const removed = meta_data?.media_images?.removed as string[];
				let index = removed.indexOf(_id.toString());
				while (index !== -1) {
					removed.splice(index, 1);
					index = removed.indexOf(_id.toString());
				}
			}
			console.log(_data);
			console.log(_id);
			await dbAdapter.updateOne('media_images', { _id }, { $addToSet: { used_by: id } });
			break;
		case 'DELETE':
			if (_id) {
				await mediaService.deleteMedia(_id); // Use MediaService to delete media
			}
			await dbAdapter.updateMany('media_images', {}, { $pull: { used_by: id } });
			break;
	}
};

// Widget Aggregations
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
