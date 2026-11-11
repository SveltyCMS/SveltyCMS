/**
 * @file src/widgets/core/many-to-many/index.ts
 * @description ManyToMany (normalized junction) relation widget definition.
 *
 * Unlike `Relation { multiple: true }` — which stores an array of ids inside the
 * document — this widget persists one junction row per edge. That enables:
 * per-link metadata and ordering, reverse queries ("which posts link to this
 * tag?") and cascade cleanup, while reads still hydrate an ordered id array so
 * the existing relation UI renders unchanged.
 *
 * The write/read integration lives in the server SDK
 * (`relation-link-service.ts` + `collections/junction-fields.ts`), not here.
 *
 * @features
 * - Same picker UI as Relation (reuses its input/display components)
 * - Accepts `string[]` or `{ id, sort?, metadata? }[]` payloads
 * - `through` selects the junction collection (default `contentRelations`)
 * - GraphQL resolves the hydrated ids to target rows with the batch loader
 */

import type { FieldInstance } from "@src/content/types";
import { createWidget } from "@src/widgets/widget-factory";
import {
  array,
  maxLength,
  minLength,
  nullish,
  number,
  object,
  optional,
  pipe,
  record,
  string,
  union,
  unknown,
  type InferInput as ValibotInput,
} from "valibot";
import type { ManyToManyProps } from "./types";

/** One edge payload: a bare id or an id with ordering/metadata. */
const edgeSchema = union([
  string(),
  object({
    id: string(),
    sort: optional(number()),
    metadata: optional(record(string(), unknown())),
  }),
]);

const validationSchema = (field: FieldInstance & ManyToManyProps) => {
  let arraySchema: any = array(edgeSchema);
  if (field.min) {
    arraySchema = pipe(
      arraySchema,
      minLength(field.min as number, `Select at least ${field.min} entries.`),
    );
  }
  if (field.max) {
    arraySchema = pipe(
      arraySchema,
      maxLength(field.max as number, `Select at most ${field.max} entries.`),
    );
  }
  return field.required
    ? pipe(arraySchema, minLength(1, "At least one entry is required."))
    : nullish(arraySchema);
};

const ManyToManyWidget = createWidget<ManyToManyProps>({
  Name: "ManyToMany",
  version: "1.0.0",
  Icon: "mdi:relation-many-to-many",
  Description:
    "Normalized many-to-many relation: one junction row per link, with optional per-link ordering and metadata.",
  inputComponentPath: "/src/widgets/core/many-to-many/input.svelte",
  displayComponentPath: "/src/widgets/core/many-to-many/display.svelte",
  validationSchema,

  GuiSchema: {
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    required: { widget: "Toggles", required: false },
    icon: { widget: "IconifyIconsPicker", required: false },
    helper: { widget: "Input", required: false },
    width: { widget: "Input", required: false },
    permissions: { widget: "PermissionsSetting", required: false },

    collection: {
      widget: "CollectionPicker",
      required: true,
    },
    displayField: {
      widget: "FieldPicker",
      required: true,
    },
    min: {
      widget: "Input",
      type: "number",
      label: "Min Items",
      required: false,
    },
    max: {
      widget: "Input",
      type: "number",
      label: "Max Items",
      required: false,
    },
    through: {
      widget: "Input",
      label: "Junction collection (advanced)",
      required: false,
    },
  },

  defaults: {
    translated: false,
    multiple: true,
    through: "contentRelations",
  },

  // Hydrated ids are resolved to target rows. Mirrors the Relation resolver so
  // both relation widgets return the same GraphQL shape.
  GraphqlSchema: ({ field, fieldName, collectionNameMapping }) => {
    const relProps = field as ManyToManyProps;
    const targetCollection = relProps.collection || (field as { relation?: string }).relation || "";
    if (!targetCollection) return { typeID: "[String]", graphql: "" };
    const cleanTypeName = collectionNameMapping?.get(targetCollection);

    if (!cleanTypeName) {
      return { typeID: "[String]", graphql: "" };
    }

    return {
      typeID: `[${cleanTypeName}]`,
      graphql: "",
      resolver: {
        [fieldName as string]: async (
          parent: Record<string, unknown>,
          _args: unknown,
          context: {
            dbAdapter?: {
              crud: {
                findMany: (
                  collection: string,
                  filter: unknown,
                ) => Promise<{ success: boolean; data?: unknown[] }>;
              };
            };
            cms?: {
              collections: {
                findById: (
                  collection: string,
                  id: string,
                  options: unknown,
                ) => Promise<{ success: boolean; data?: unknown }>;
              };
            };
            tenantId?: unknown;
            user?: unknown;
            loaders?: {
              collectionLoader?: Map<string, { load: (id: string) => Promise<unknown> }>;
            };
          },
        ) => {
          const val = parent[fieldName as string];
          if (!Array.isArray(val) || val.length === 0) return [];

          const { dbAdapter, cms, tenantId, user, loaders } = context;

          if (loaders?.collectionLoader) {
            const loader = loaders.collectionLoader.get(targetCollection);
            if (!loader) return [];
            const results = await Promise.all(val.map((id) => loader.load(String(id))));
            return results.filter(Boolean);
          }

          if (cms) {
            const results = await Promise.all(
              val.map((id) =>
                cms.collections.findById(targetCollection, String(id), { tenantId, user }),
              ),
            );
            return results.map((r) => (r.success ? r.data : null)).filter(Boolean);
          }

          if (!dbAdapter) return [];
          const result = await dbAdapter.crud.findMany(targetCollection, {
            _id: { $in: val },
            tenantId,
          });
          return result.success ? (result.data ?? []) : [];
        },
      },
    };
  },
});

export default ManyToManyWidget;

export type FieldType = ReturnType<typeof ManyToManyWidget>;
export type ManyToManyWidgetData = ValibotInput<any>;
