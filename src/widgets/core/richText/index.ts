/**
 * @file src/widgets/core/richText/index.ts
 * @description - richText TipTap index file
 *
 * @example
 * import { widgets } from '@widgets/index';
 *
 * Features:
 * - RichText TipTap widget
 */

import { publicEnv } from '@root/config/public';
import { getFieldName, getGuiFields } from '@utils/utils';
import { GuiSchema, toString, GraphqlSchema, type Params } from './types';
import type { ModifyRequestParams } from '..';

// ParaglideJS
import * as m from '@src/paraglide/messages';

// System Logger
import { logger } from '@utils/logger.svelte';

const WIDGET_NAME = 'RichText' as const;

// Type guard for File objects
function isValidFile(file: unknown): file is File {
	return file !== null && typeof file === 'object' && 'name' in file && 'size' in file && file instanceof File;
}

// Helper function to get content language
function getContentLanguage(contentLanguage?: string): string {
	return contentLanguage || publicEnv.DEFAULT_CONTENT_LANGUAGE;
}

// Defines RichText widget Parameters
const widget = (params: Params & { widgetId?: string }) => {
	// Define the display function
	let display: ((args: { data: Record<string, unknown>; contentLanguage?: string }) => Promise<string> | string) & { default?: boolean };

	if (!params.display) {
		display = async ({ data, contentLanguage }) => {
			data = data || {}; // Ensure data is not undefined
			const language = getContentLanguage(contentLanguage);
			return params.translated ? data[language] || m.widgets_nodata() : data[publicEnv.DEFAULT_CONTENT_LANGUAGE] || m.widgets_nodata();
		};
		display.default = true;
	} else {
		display = params.display;
	}

	// Define the widget object
	const widget = {
		widgetId: params.widgetId,
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
	};

	// Return the field and widget objects
	return { ...field, widget };
};

widget.modifyRequest = async ({ data, type, id, meta_data }: ModifyRequestParams<typeof widget>) => {
	if (!dbAdapter) {
		const error = 'Database adapter is not initialized';
		logger.error(error);
		throw new Error(error);
	}

	try {
		switch (type) {
			case 'POST':
			case 'PATCH': {
				const images = data.get().images;
				const _data = data.get().data;
				let _id;

				// Extract image IDs from content
				const imageMatches = (_data.content['en'] as string).matchAll(/media_image="(.+?)"/gms);
				for (const match of imageMatches) {
					// Images from richtext content itself
					images[match[1]] = match[1];
				}

				for (const img_id in images) {
					if (isValidFile(images[img_id])) {
						// TODO: This media saving should be handled via server action
						logger.warn('MediaService usage disabled in richText widget for browser compatibility');

						// Skip media processing in browser context
						continue;
					} else {
						// Selected from Media images
						_id = images[img_id];
					}

					// Handle removed media files
					if (meta_data?.media_images?.removed && _id) {
						const removed = meta_data.media_images.removed as string[];
						let index = removed.indexOf(_id.toString());

						while (index !== -1) {
							removed.splice(index, 1);
							index = removed.indexOf(_id.toString());
						}
					}

					// Update media references
					if (_id) {
						await dbAdapter.updateOne('media_images', { _id }, { $addToSet: { used_by: id } });
						logger.info(`Updated media reference: ${_id}`);
					}
				}
				data.update(_data);
				break;
			}
			case 'DELETE': {
				await dbAdapter.updateMany('media_images', {}, { $pull: { used_by: id } });
				logger.info('Removed all media references');
				break;
			}
		}
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err);
		logger.error(`Error in modifyRequest: ${error}`);
		throw err;
	}
};

// Assign Name, GuiSchema and GraphqlSchema to the widget function
widget.Name = WIDGET_NAME;
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;
widget.toString = toString;

// Widget icon and helper text
widget.Icon = 'icon-park-outline:text';
widget.Description = m.widget_text_description();

// Widget Aggregations
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

// Export widget function and its type
export type FieldType = ReturnType<typeof widget>;
export default widget;
