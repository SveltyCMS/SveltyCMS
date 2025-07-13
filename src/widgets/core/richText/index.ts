/**
 * @file src/widgets/core/richText/index.ts
 * @description - richText TipTap index file.
 */

import { publicEnv } from '@root/config/public';
import { getFieldName, getGuiFields } from '@utils/utils';
import { GuiSchema, toString, GraphqlSchema, type Params } from './types';
import type { ModifyRequestParams, Aggregations } from '..';
// Assuming dbAdapter and MediaService are correctly imported and initialized elsewhere
import { dbAdapter } from '@src/databases/db';
// CORRECTED IMPORT PATH: Pointing directly to the MediaService.ts file
import { MediaService } from '@src/utils/media/MediaService';
import type { MediaAccess } from '@src/utils/media/mediaModels';
import { Permission } from '@src/utils/media/mediaModels';

// ParaglideJS
import * as m from '@src/paraglide/messages';

// System Logger
import { logger } from '@utils/logger.svelte';

const WIDGET_NAME = 'RichText' as const;

// Type guard for File objects
function isValidFile(file: unknown): file is File {
	return file instanceof File && typeof file.name === 'string' && typeof file.size === 'number';
}

// Helper function to get content language
function getContentLanguage(contentLanguage?: string): string {
	return contentLanguage || publicEnv.DEFAULT_CONTENT_LANGUAGE;
}

// Helper function to get MediaService instance
function getMediaService(): MediaService {
	if (!dbAdapter) throw new Error('Database adapter is not initialized');
	try {
		return new MediaService(dbAdapter);
	} catch (err) {
		const message = `Failed to initialize MediaService: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw new Error(message);
	}
}

/**
 * Defines RichText widget Parameters
 */
const widget = (params: Params & { widgetId?: string }) => {
	let display: any;

	if (!params.display) {
		display = async ({ data, contentLanguage }) => {
			data = data || {};
			const language = getContentLanguage(contentLanguage);
			const header = data.header?.[language] || '';
			const content = data.content?.[language] || m.widgets_nodata();
			// Basic display, can be enhanced
			return `<h4>${header}</h4><div>${content}</div>`;
		};
		display.default = true;
	} else {
		display = params.display;
	}

	const widgetDef = {
		widgetId: params.widgetId,
		Name: WIDGET_NAME,
		GuiFields: getGuiFields(params, GuiSchema)
	};

	const fieldDef = {
		display,
		label: params.label,
		db_fieldName: params.db_fieldName,
		translated: params.translated,
		required: params.required,
		icon: params.icon,
		width: params.width,
		helper: params.helper,
		permissions: params.permissions
	};

	return { ...fieldDef, widget: widgetDef };
};

widget.modifyRequest = async ({ data, type, id, meta_data, user }: ModifyRequestParams<typeof widget>) => {
	if (!dbAdapter) {
		logger.error('Database adapter is not initialized in RichText modifyRequest');
		throw new Error('Database adapter is not initialized');
	}

	try {
		switch (type) {
			case 'POST':
			case 'PATCH': {
				const widgetData = data.get();
				const images = widgetData.images || {};
				const _data = widgetData.data || { content: {}, header: {} };

				// Step 1: Handle images removed from the editor
				const removedImageIds = meta_data?.media_images_remove || [];
				if (removedImageIds.length > 0) {
					logger.info(`Removing references for ${removedImageIds.length} images.`, { entryId: id });
					await dbAdapter.updateMany('media_images', { _id: { $in: removedImageIds } }, { $pull: { used_by: id } });
				}

				// Step 2: Upload new files and get their permanent IDs
				let mediaService: MediaService | null = null;
				const idReplacements: Record<string, { newId: string; url: string }> = {};

				for (const tempId in images) {
					if (isValidFile(images[tempId])) {
						if (!mediaService) mediaService = getMediaService();
						const access: MediaAccess = { userId: user._id.toString(), permissions: [Permission.Read, Permission.Write, Permission.Delete] };
						try {
							const file = images[tempId] as File;
							const res = await mediaService.saveMedia(file, user._id, access);
							idReplacements[tempId] = { newId: res._id.toString(), url: res.url };
							logger.info(`Successfully saved new media: ${file.name}`, { newId: res._id.toString() });
						} catch (err) {
							logger.error(`Error saving media: ${err instanceof Error ? err.message : String(err)}`);
							throw err; // Re-throw to fail the request if an upload fails
						}
					}
				}

				// Step 3: Replace temporary IDs in the content with permanent ones
				for (const lang in _data.content) {
					let content = _data.content[lang] || '';
					for (const tempId in idReplacements) {
						const { newId, url } = idReplacements[tempId];
						const tempIdRegex = new RegExp(`data-media-id="${tempId}"`, 'g');
						const srcRegex = new RegExp(`src="blob:[^"]*"`, 'g'); // More specific regex for blob URLs
						content = content.replace(tempIdRegex, `data-media-id="${newId}"`).replace(srcRegex, `src="${url}"`);
					}
					_data.content[lang] = content;
				}

				// Step 4: Get a final list of all media IDs used in the content
				const finalMediaIds = new Set<string>();
				for (const lang in _data.content) {
					const content = _data.content[lang] || '';
					const imageMatches = content.matchAll(/data-media-id="([^"]+)"/g);
					for (const match of imageMatches) {
						finalMediaIds.add(match[1]);
					}
				}

				// Step 5: Ensure this entry's ID is in the `used_by` array for all final images
				if (finalMediaIds.size > 0) {
					logger.info(`Updating references for ${finalMediaIds.size} images.`, { entryId: id });
					await dbAdapter.updateMany('media_images', { _id: { $in: [...finalMediaIds] } }, { $addToSet: { used_by: id } });
				}

				// Finally, update the entry's data
				data.update(_data);
				break;
			}
			case 'DELETE': {
				// When deleting the entire entry, remove its ID from all media items it might have used.
				logger.info(`Entry deletion: Removing all media references for entry ID: ${id}`);
				await dbAdapter.updateMany('media_images', { used_by: id }, { $pull: { used_by: id } });
				break;
			}
		}
	} catch (err) {
		logger.error(`Error in RichText modifyRequest: ${err instanceof Error ? err.message : String(err)}`);
		throw err;
	}
};

widget.Name = WIDGET_NAME;
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;
widget.toString = toString;

widget.Icon = 'icon-park-outline:text';
widget.Description = m.widget_text_description();

widget.aggregations = {
	filters: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const fieldName = getFieldName(field);
		const language = getContentLanguage(info.contentLanguage);
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
	sorts: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const fieldName = getFieldName(field);
		const language = getContentLanguage(info.contentLanguage);
		return [{ $sort: { [`${fieldName}.${language}`]: info.sort || 1 } }];
	}
} as Aggregations;

export type FieldType = ReturnType<typeof widget>;
export default widget;

