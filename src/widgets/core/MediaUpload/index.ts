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
import Checkbox from '@src/widgets/core/Checkbox/index';
import Input from '@src/widgets/core/Input/index';

// Type for aggregation field parameter
type AggregationField = { db_fieldName: string; [key: string]: unknown };

import { array, minLength, optional, pipe, string, type BaseIssue, type BaseSchema, type InferInput as ValibotInput } from 'valibot';
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
		allowedTypes: []
	},

	GuiSchema: {
		multiupload: { widget: Checkbox, label: 'Allow Multiple Files' },
		watermark: {
			widget: 'group',
			label: 'Watermark Options',
			fields: {
				text: { widget: Input, label: 'Watermark Text' },
				position: { widget: Input, label: 'Position (e.g., center, top-right)' },
				opacity: { widget: Input, label: 'Opacity (0-1)' },
				scale: { widget: Input, label: 'Scale (e.g., 0.5 for 50%)' }
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
