/**
 * @file src/widgets/core/MediaUpload/index.ts
 * @description Media Widget Definition.
 *
 * Implements a powerful media selector using the Three Pillars Architecture.
 * Stores references (IDs) to media files, keeping content documents lightweight.
 *
 * @features
 * - **Relational Data**: Stores media IDs, not the full media objects.
 * - **Dynamic Validation**: Schema adapts to `multiupload` (single ID vs. array of IDs).
 * - **Modal-Based UX**: Designed to work with a separate media library modal.
 * - **Advanced Aggregation**: Performs a `$lookup` to filter/sort based on actual media metadata.
 */

import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/widgetFactory';

// import Checkbox from '@src/widgets/core/Checkbox/index';
// import Input from '@src/widgets/core/Input/index';

// Type for aggregation field parameter
interface AggregationField {
	db_fieldName: string;
	[key: string]: unknown;
}

import { array, type BaseIssue, type BaseSchema, minLength, optional, pipe, string, type InferInput as ValibotInput } from 'valibot';
import type { MediaProps } from './types';

// ✅ SSOT: Validation Schema - Exported for use in Input.svelte
export const createValidationSchema = (field: ReturnType<typeof MediaWidget>): BaseSchema<unknown, unknown, BaseIssue<unknown>> => {
	// The base schema for a single media ID (must be a non-empty string).
	const idSchema = pipe(string(), minLength(1, 'A media file is required.'));

	// If multiupload is enabled, the value should be an array of IDs.
	if (field.multiupload) {
		const arraySchema = array(idSchema);
		// If the field is required, the array must not be empty.
		return field.required ? pipe(arraySchema, minLength(1, 'At least one media file is required.')) : optional(arraySchema);
	}

	// Otherwise, the value is just a single ID string.
	return field.required ? idSchema : optional(idSchema, '');
};

// Create the widget definition using the factory.
const MediaWidget = createWidget<MediaProps>({
	Name: 'MediaUpload',
	Icon: 'mdi:image-multiple',
	Description: m.widget_media_description(),
	inputComponentPath: '/src/widgets/core/MediaUpload/Input.svelte',
	displayComponentPath: '/src/widgets/core/MediaUpload/Display.svelte',
	validationSchema: createValidationSchema,

	// Set widget-specific defaults.
	defaults: {
		multiupload: false,
		allowedTypes: [],
		folder: 'global'
	},

	modifyRequest: async ({ data, field, user, tenantId, collectionName }) => {
		if (import.meta.env.SSR) {
			const accessor = data as any;
			const value = accessor.get();
			if (!value) {
				return {};
			}

			// We only process if it's a File object (meaning it's a new upload)
			if (value instanceof File) {
				const { MediaService } = await import('@src/utils/media/mediaService.server');
				const { dbAdapter } = await import('@src/databases/db');
				if (!dbAdapter) {
					throw new Error('Database adapter not available');
				}

				const mediaService = new MediaService(dbAdapter);
				const f = field as any;

				// DYNAMIC FOLDER RESOLUTION:
				// 1. Explicitly configured field.folder (from schema)
				// 2. Default to collections/[collectionName] if available
				// 3. Fallback to tenantId or 'global'
				const basePath = f.folder || (collectionName ? `collections/${String(collectionName).toLowerCase()}` : tenantId || 'global');

				const savedMedia = await mediaService.saveMedia(value, (user as any)._id.toString(), 'private', basePath);
				accessor.update(savedMedia._id);
			} else if (Array.isArray(value)) {
				// Handle multiupload
				const processedIds: string[] = [];
				const { MediaService } = await import('@src/utils/media/mediaService.server');
				const { dbAdapter } = await import('@src/databases/db');
				if (!dbAdapter) {
					throw new Error('Database adapter not available');
				}
				const mediaService = new MediaService(dbAdapter);
				const f = field as any;

				const basePath = f.folder || (collectionName ? `collections/${String(collectionName).toLowerCase()}` : tenantId || 'global');

				for (const item of value) {
					if (item instanceof File) {
						const savedMedia = await mediaService.saveMedia(item, (user as any)._id.toString(), 'private', basePath);
						processedIds.push(savedMedia._id);
					} else {
						processedIds.push(item);
					}
				}
				accessor.update(processedIds);
			}
		}
		return {};
	},

	GuiSchema: {
		multiupload: { widget: 'Checkbox', label: 'Allow Multiple Files' },
		folder: { widget: 'Input', label: 'Storage Folder', placeholder: 'e.g. collection/post' },
		placeholder: { widget: 'Input', label: 'Placeholder Text', required: false },
		watermark: {
			widget: 'group',
			label: 'Watermark Options',
			fields: {
				text: { widget: 'Input', label: 'Watermark Text' },
				position: { widget: 'Input', label: 'Position (e.g., center, top-right)' },
				opacity: { widget: 'Input', label: 'Opacity (0-1)' },
				scale: { widget: 'Input', label: 'Scale (e.g., 0.5 for 50%)' }
			}
		}
	},

	// Aggregation performs a lookup to search by the actual media file name.
	aggregations: {
		filters: async ({ field, filter }: { field: AggregationField; filter: string }) => [
			// Join with the 'media_files' collection.
			{
				$lookup: {
					from: 'media_files',
					localField: field.db_fieldName,
					foreignField: '_id',
					as: 'media_docs'
				}
			},
			// Filter based on the name of the joined media files.
			{
				$match: {
					'media_docs.name': { $regex: filter, $options: 'i' }
				}
			}
		]
		// Sorting would follow a similar `$lookup` pattern.
	}
});

export default MediaWidget;

// Export helper types.
export type FieldType = ReturnType<typeof MediaWidget>;
export type MediaWidgetData = ValibotInput<ReturnType<typeof createValidationSchema>>;
