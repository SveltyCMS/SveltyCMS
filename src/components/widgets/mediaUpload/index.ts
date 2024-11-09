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

const WIDGET_NAME = 'MediaUpload' as const;

import { publicEnv } from '@root/config/public';

// Media
import { MediaService } from '@utils/media/MediaService';
import type { MediaType, MediaAccess } from '@utils/media/mediaModels';
import { Permission } from '@utils/media/mediaModels';

import { getFieldName, getGuiFields, get_elements_by_id, meta_data } from '@utils/utils';
import { dbAdapter } from '@src/databases/db';
import { type Params, GuiSchema, GraphqlSchema } from './types';
import { type ModifyRequestParams } from '..';

// System Logger
import { logger } from '@utils/logger';

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

// Type guard for string data
function isValidString(data: unknown): data is string {
	return typeof data === 'string' && data.length > 0;
}

// Type guard for info with contentLanguage
interface AggregationInfo {
	field: any;
	contentLanguage?: string;
	filter?: string;
	sort?: number;
}

function getLanguage(info: AggregationInfo): string {
	return info.contentLanguage || publicEnv.DEFAULT_CONTENT_LANGUAGE;
}

// Helper function to safely get element by ID
async function safeGetElementById(id: unknown, callback: (data: any) => void): Promise<void> {
	if (isValidString(id)) {
		await get_elements_by_id.add('media_files', id, callback);
	}
}

// Helper function to ensure valid ID
function ensureValidId(id: unknown): string {
	if (!isValidString(id)) {
		throw new Error('Invalid ID provided');
	}
	return id;
}

// Helper function to get MediaService instance
function getMediaService(): MediaService {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	try {
		const service = new MediaService(dbAdapter);
		logger.info('MediaService initialized successfully');
		return service;
	} catch (err) {
		const message = `Failed to initialize MediaService: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw new Error(message);
	}
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
				return data?.thumbnail?.url || '';
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
						return `<img class='max-w-[200px] inline-block' src="${url}" alt="Media preview" />`;
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
			url: params.watermark?.url || '',
			position: params.watermark?.position || 'center',
			opacity: params.watermark?.opacity || 1,
			scale: params.watermark?.scale || 1,
			offsetX: params.watermark?.offsetX || 0,
			offsetY: params.watermark?.offsetY || 0,
			rotation: params.watermark?.rotation || 0
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
		const validId = ensureValidId(id);

		switch (type) {
			case 'GET':
				data.update(null);
				await safeGetElementById(_data, (newData) => data.update(newData));
				break;
			case 'POST':
			case 'PATCH':
				if (_data instanceof File) {
					// Initialize MediaService when needed
					const mediaService = getMediaService();

					// Define proper access permissions
					const access: MediaAccess = {
						userId: validId,
						permissions: [Permission.Read, Permission.Write, Permission.Delete]
					};

					// Use mediaService to save the file
					const savedMedia = await mediaService.saveMedia(_data, validId, access);

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
						await dbAdapter.updateOne('media_files', { _id: savedMedia._id }, { $addToSet: { used_by: validId } });
						logger.info(`Updated media file usage reference: ${savedMedia._id}`);
					}
				} else if (_data && typeof _data === 'object' && '_id' in _data) {
					const mediaId = String(_data._id); // Convert to string explicitly
					data.update(mediaId);
				}
				break;
			case 'DELETE':
				if (isValidString(_data)) {
					// Initialize MediaService when needed
					const mediaService = getMediaService();

					// Use mediaService to delete the file
					await mediaService.deleteMedia(_data);
					logger.info(`Deleted media file: ${_data}`);
				} else if (dbAdapter) {
					await dbAdapter.updateMany('media_files', {}, { $pull: { used_by: validId } });
					logger.info('Removed all media file references');
				}
				break;
		}
		requestState.success = true;
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		requestState.error = errorMessage;
		logger.error(`Error in mediaUpload widget: ${errorMessage}`);
	} finally {
		requestState.loading = false;
	}
};

// Widget Aggregations with reactive state
widget.aggregations = {
	filters: async (info: AggregationInfo) => {
		const field = info.field as ReturnType<typeof widget>;
		const fieldName = $derived(() => getFieldName(field));
		const language = getLanguage(info);

		return [
			{
				$match: {
					[`${fieldName}.header.${language}`]: {
						$regex: info.filter || '',
						$options: 'i'
					}
				}
			}
		];
	},
	sorts: async (info: AggregationInfo) => {
		const field = info.field as ReturnType<typeof widget>;
		const fieldName = $derived(() => getFieldName(field));
		const language = getLanguage(info);

		return [{ $sort: { [`${fieldName}.${language}`]: info.sort || 1 } }];
	}
} as Aggregations;

// Export widget function and extend with FieldType
export default widget;
export type FieldType = ReturnType<typeof widget>;
