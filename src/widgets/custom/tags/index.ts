/**
 * @file src/widgets/custom/tags/index.ts
 * @description Tags Widget Definition - Multi-tag entry system.
 *
 * Implements a chip-based tagging system using the Three Pillars Architecture.
 * Stores an array of strings.
 */

import { createWidget } from "@src/widgets/widget-factory";
import {
  array,
  maxLength,
  minLength,
  nullable,
  pipe,
  string,
  type InferInput as ValibotInput,
} from "valibot";
import type { TagsProps } from "./types";

// ✅ SSOT: Validation Schema
export const createValidationSchema = (field: any) => {
  const itemSchema = pipe(string(), minLength(1, "Tag cannot be empty."));
  let arraySchema: any = array(itemSchema);

  if (field.minTags) {
    arraySchema = pipe(
      arraySchema,
      minLength(field.minTags, `Must have at least ${field.minTags} tags.`),
    );
  }
  if (field.maxTags) {
    arraySchema = pipe(
      arraySchema,
      maxLength(field.maxTags, `Cannot have more than ${field.maxTags} tags.`),
    );
  }

  return field.required
    ? pipe(arraySchema, minLength(1, "At least one tag is required."))
    : nullable(arraySchema);
};

// Create the widget definition
const TagsWidget = createWidget<TagsProps>({
  Name: "Tags",
  Icon: "mdi:tag-multiple",
  Description: "Chip-based multi-tag entry system with auto-complete.",
  inputComponentPath: "/src/widgets/custom/tags/input.svelte",
  displayComponentPath: "/src/widgets/custom/tags/display.svelte",

  validationSchema: createValidationSchema,

  defaults: {
    translated: false,
    allowDuplicates: false,
    caseSensitive: false,
    suggestions: [],
  },

  GuiSchema: {
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    required: { widget: "Toggles", required: false },
    minTags: { widget: "Input", type: "number", label: "Min Tags" },
    maxTags: { widget: "Input", type: "number", label: "Max Tags" },
    suggestions: {
      widget: "Input",
      label: "Suggestions (Comma-separated)",
      helper: "Predefined tags for auto-complete",
    },
    allowDuplicates: { widget: "Toggles", label: "Allow Duplicates" },
    placeholder: { widget: "Input", required: false },
  },

  aggregations: {
    filters: async ({ field, filter }: any) => [
      {
        $match: {
          [field.db_fieldName]: { $in: [new RegExp(filter, "i")] },
        },
      },
    ],
    sorts: async ({ field, sortDirection }: any) => ({
      [field.db_fieldName]: sortDirection,
    }),
  },

  GraphqlSchema: () => ({
    typeID: "[String]",
    graphql: "",
  }),
});

export default TagsWidget;

export type FieldType = ReturnType<typeof TagsWidget>;
export type TagsWidgetData = ValibotInput<any>;
