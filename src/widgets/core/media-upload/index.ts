/**
 * @file src/widgets/custom/MediaUpload/index.ts
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

import { widget_media_description } from "@src/paraglide/messages";
import { createWidget } from "@src/widgets/widget-factory";

// import Checkbox from '@src/widgets/core/checkbox/index';
// import Input from '@src/widgets/core/input/index';

// Type for aggregation field parameter
interface AggregationField {
  db_fieldName: string;
  [key: string]: unknown;
}

import {
  array,
  type BaseIssue,
  type BaseSchema,
  minLength,
  nullable,
  pipe,
  string,
  type InferInput as ValibotInput,
} from "valibot";
import type { MediaProps } from "./types";
import type { DatabaseId } from "@src/content/types";

// ✅ SSOT: Validation Schema - Exported for use in Input.svelte
export const createValidationSchema = (
  field: MediaProps & { required?: boolean },
): BaseSchema<unknown, unknown, BaseIssue<unknown>> => {
  // The base schema for a single media ID (must be a non-empty string).
  const idSchema = pipe(string(), minLength(1, "A media file is required."));

  // If multiupload is enabled, the value should be an array of IDs.
  if (field.multiupload) {
    const arraySchema = array(idSchema);
    // If the field is required, the array must not be empty.
    return field.required
      ? pipe(arraySchema, minLength(1, "At least one media file is required."))
      : nullable(arraySchema);
  }

  // Otherwise, the value is just a single ID string.
  return field.required ? idSchema : nullable(idSchema);
};

// Create the widget definition using the factory.
const MediaWidget = createWidget<MediaProps>({
  Name: "MediaUpload",
  Icon: "mdi:image-multiple",
  Description: widget_media_description(),
  inputComponentPath: "/src/widgets/custom/media-upload/input.svelte",
  displayComponentPath: "/src/widgets/custom/media-upload/display.svelte",
  validationSchema: createValidationSchema,

  // Set widget-specific defaults.
  defaults: {
    multiupload: false,
    allowedTypes: [],
    folder: "global",
    altText: false,
  },

  modifyRequest: async ({ data, field, user, tenantId, collectionName }) => {
    if (!import.meta.env.SSR) return {};

    const accessor = data as {
      get: () => unknown;
      update: (v: unknown) => void;
    };
    const value = accessor.get();
    if (!value) return {};

    // Delegate to extracted server-side helper — keeps widget import tree clean
    const { processMediaUpload } = await import("./process-upload");
    const { ids, isMulti } = await processMediaUpload(value, {
      field: {
        folder: (field as Record<string, unknown>).folder as string | undefined,
        multiupload: (field as Record<string, unknown>).multiupload as boolean | undefined,
      },
      user: { _id: (user as Record<string, unknown>)._id as DatabaseId },
      tenantId: String(tenantId ?? "default"),
      collectionName: collectionName ? String(collectionName) : undefined,
    });

    if (ids.length > 0) {
      accessor.update(isMulti ? ids : ids[0]);
    }
    return {};
  },

  GuiSchema: {
    multiupload: { widget: "Checkbox", label: "Allow Multiple Files" },
    folder: {
      widget: "Input",
      label: "Storage Folder",
      placeholder: "e.g. collection/post",
    },
    placeholder: {
      widget: "Input",
      label: "Placeholder Text",
      required: false,
    },
    watermark: {
      widget: "group",
      label: "Watermark Options",
      fields: {
        text: { widget: "Input", label: "Watermark Text" },
        position: {
          widget: "Input",
          label: "Position (e.g., center, top-right)",
        },
        opacity: { widget: "Input", label: "Opacity (0-1)" },
        scale: { widget: "Input", label: "Scale (e.g., 0.5 for 50%)" },
      },
    },
  },

  // Aggregation performs a lookup to search by the actual media file name.
  aggregations: {
    filters: async ({ field, filter }: { field: AggregationField; filter: string }) => [
      // Join with the 'media_files' collection.
      {
        $lookup: {
          from: "media_files",
          localField: field.db_fieldName,
          foreignField: "_id",
          as: "media_docs",
        },
      },
      // Filter based on the name of the joined media files.
      {
        $match: {
          "media_docs.name": { $regex: filter, $options: "i" },
        },
      },
    ],
    // Sorting would follow a similar `$lookup` pattern.
  },

  // GraphQL schema for media (returns MediaImage type for population)
  GraphqlSchema: ({ field, fieldName }) => {
    const isMulti = (field as MediaProps).multiupload;
    return {
      typeID: isMulti ? "[MediaImage]" : "MediaImage",
      graphql: "",
      resolver: {
        [fieldName as string]: async (parent: any, _args: any, context: any) => {
          const { dbAdapter, tenantId } = context;
          if (!dbAdapter) return null;

          const val = parent[fieldName as string];
          if (!val) return null;

          if (isMulti && Array.isArray(val)) {
            const result = await dbAdapter.crud.findMany("media", {
              _id: { $in: val },
              tenantId,
            });
            return result.success ? result.data : [];
          }

          const result = await dbAdapter.crud.findOne("media", {
            _id: val,
            tenantId,
          });
          return result.success ? result.data : null;
        },
      },
    };
  },
});

export default MediaWidget;

// Export helper types.
export type FieldType = ReturnType<typeof MediaWidget>;
export type MediaWidgetData = ValibotInput<ReturnType<typeof createValidationSchema>>;
