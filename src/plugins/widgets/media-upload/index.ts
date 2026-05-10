/**
 * @file src/plugins/widgets/media-upload/index.ts
 * @description Media Widget Definition.
 */

import { widget_media_description } from "@src/paraglide/messages";
import { createWidget } from "@src/widgets/widget-factory";

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
        const { MediaService } = await import("@src/utils/media/media-service.server");
        const { dbAdapter } = await import("@src/databases/db");
        if (!dbAdapter) {
          throw new Error("Database adapter not available");
        }

        const service = new MediaService(dbAdapter);
        const f = field as any;

        const basePath =
          f.folder ||
          (collectionName
            ? `collections/${String(collectionName).toLowerCase()}`
            : tenantId || "global");

        const savedMedia = await service.saveMedia(
          value,
          (user as any)._id.toString(),
          "private",
          basePath,
        );
        if (savedMedia.success) {
          accessor.update(savedMedia.data._id);
        }
      } else if (Array.isArray(value)) {
        // Handle multiupload
        const processedIds: string[] = [];
        const { MediaService } = await import("@src/utils/media/media-service.server");
        const { dbAdapter } = await import("@src/databases/db");
        if (!dbAdapter) {
          throw new Error("Database adapter not available");
        }
        const service = new MediaService(dbAdapter);
        const f = field as any;

        const basePath =
          f.folder ||
          (collectionName
            ? `collections/${String(collectionName).toLowerCase()}`
            : tenantId || "global");

        for (const item of value) {
          if (item instanceof File) {
            const savedMedia = await service.saveMedia(
              item,
              (user as any)._id.toString(),
              "private",
              basePath,
            );
            if (savedMedia.success) {
              processedIds.push(savedMedia.data._id);
            }
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

  aggregations: {
    filters: async ({ field, filter }: { field: AggregationField; filter: string }) => [
      {
        $lookup: {
          from: "media_files",
          localField: field.db_fieldName,
          foreignField: "_id",
          as: "media_docs",
        },
      },
      {
        $match: {
          "media_docs.name": { $regex: filter, $options: "i" },
        },
      },
    ],
  },

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
