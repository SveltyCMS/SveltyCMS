/**
@file src/components/widgets/mediaUpload/index.ts
@description - mediaUpload index file  

Features:
- Media upload for images, videos, audio, and documents
- Drag and drop support for file upload
- Preview of uploaded files
- File sorting and reordering
- Array of uploaded files
*/

const WIDGET_NAME = 'MediaUpload' as const; // Defines MediaUpload widget Parameters

import { getFieldName, getGuiFields, get_elements_by_id, meta_data } from '@utils/utils';
import { MediaService } from '@utils/media/MediaService';
import { dbAdapter } from '@src/databases/db';
import { type Params, GuiSchema, GraphqlSchema } from './types';
import { type ModifyRequestParams } from '..';
import type { MediaType } from '@utils/media/mediaModels';

// Initialize MediaService if dbAdapter is available
const mediaService = dbAdapter ? new MediaService(dbAdapter) : null;
if (!mediaService) {
	console.error('Failed to initialize MediaService: Database adapter is not available');
}

// ParaglideJS
import * as m from '@src/paraglide/messages';

// Extend meta_data type
interface ExtendedMetaData {
	media_files?: {
		removed: string[];
	};
}

// Type guard to ensure media has an ID
function hasMediaId(media: MediaType): media is MediaType & { _id: string } {
	return media._id !== undefined && typeof media._id === 'string';
}

const widget = (params: Params) => {
	// Define the display function with reactive state
	let display: any;

	if (!params.display) {
		display = async ({ data }) => {
			// Use $derived for computed URL
			const url = $derived(() => {
				if (data instanceof FileList) {
					return URL.createObjectURL(data[0]);
				} else if (data instanceof File) {
					return URL.createObjectURL(data);
				}
				return data?.thumbnail?.url;
			});

			// Use $derived for computed display content
			const content = $derived(() => {
				switch (params.type) {
					case 'video':
						return `<video class='max-w-[200px] inline-block' src="${url}" controls></video>`;
					case 'audio':
						return `<audio class='max-w-[200px] inline-block' src="${url}" controls></audio>`;
					case 'document':
						return `<a class='max-w-[200px] inline-block' href="${url}" target="_blank">${data?.name || 'Document'}</a>`;
					default:
						return `<img class='max-w-[200px] inline-block' src="${url}" />`;
				}
			});

			return content;
		};
		display.default = true;
	}

	// Define the widget object with reactive state
	const widget = {
		Name: WIDGET_NAME,
		GuiFields: $derived(() => getGuiFields(params, GuiSchema))
	};

	// Define the field object with reactive properties
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
		folder: $state(params.folder || 'unique'),
		multiupload: $state(params.multiupload),
		sizelimit: $state(params.sizelimit),
		extensions: $state(params.extensions),
		metadata: $state(params.metadata),
		tags: $state(params.tags),
		categories: $state(params.categories),
		responsive: $state(params.responsive),
		customDisplayComponent: params.customDisplayComponent,
		watermark: $state({
			url: params.watermark?.url,
			position: params.watermark?.position,
			opacity: params.watermark?.opacity,
			scale: params.watermark?.scale,
			offsetX: params.watermark?.offsetX,
			offsetY: params.watermark?.offsetY,
			rotation: params.watermark?.rotation
		})
	};

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

widget.modifyRequest = async ({ data, type, id }: ModifyRequestParams<typeof widget>) => {
	const requestState = $state({
		loading: false,
		error: null as string | null,
		success: false
	});

	try {
		requestState.loading = true;
		const _data = data.get();
		const extendedMetaData = meta_data as unknown as ExtendedMetaData;

		switch (type) {
			case 'GET':
				if (typeof _data === 'string') {
					data.update(null);
					get_elements_by_id.add('media_files', _data, (newData) => data.update(newData));
				}
				break;
			case 'POST':
			case 'PATCH':
				if (_data instanceof File) {
					if (!mediaService) {
						throw new Error('MediaService is not initialized');
					}

					// Use mediaService to save the file
					const savedMedia = await mediaService.saveMedia(_data, id, { public: true });

					// Verify we have a valid media object with ID
					if (!hasMediaId(savedMedia)) {
						throw new Error('Failed to get media ID from saved media');
					}

					// Now TypeScript knows savedMedia._id is a string
					data.update(savedMedia._id);

					// Handle removed media files
					const removedFiles = extendedMetaData?.media_files?.removed;
					if (Array.isArray(removedFiles)) {
						const index = removedFiles.indexOf(savedMedia._id);
						if (index !== -1) {
							removedFiles.splice(index, 1);
						}
					}

					// Update used_by reference
					if (dbAdapter) {
						await dbAdapter.updateOne('media_files', { _id: savedMedia._id }, { $addToSet: { used_by: id } });
					}
				} else if (_data && typeof _data === 'object' && '_id' in _data) {
					const mediaId = String(_data._id); // Convert to string explicitly
					data.update(mediaId);
				}
				break;
			case 'DELETE':
				if (_data && typeof _data === 'string' && mediaService) {
					// Use mediaService to delete the file
					await mediaService.deleteMedia(_data);
				} else if (dbAdapter) {
					await dbAdapter.updateMany('media_files', {}, { $pull: { used_by: id } });
				}
				break;
		}
		requestState.success = true;
	} catch (error) {
		requestState.error = error instanceof Error ? error.message : 'Unknown error';
	} finally {
		requestState.loading = false;
	}
};

// Widget Aggregations with reactive state
widget.aggregations = {
	filters: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const fieldName = $derived(() => getFieldName(field));

		return [
			{
				$match: {
					[`${fieldName}.header.${info.contentLanguage}`]: {
						$regex: info.filter,
						$options: 'i'
					}
				}
			}
		];
	},
	sorts: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const fieldName = $derived(() => getFieldName(field));

		return [{ $sort: { [`${fieldName}.original.name`]: info.sort } }];
	}
} as Aggregations;

// Export widget function and extend with FieldType
export default widget;
export type FieldType = ReturnType<typeof widget>;
