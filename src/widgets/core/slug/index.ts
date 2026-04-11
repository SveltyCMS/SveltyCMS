/**
 * @file src/widgets/core/slug/index.ts
 * @description Slug Widget Definition - URL-safe identifier
 *
 * Implements a specialized slug widget that generates URL-safe strings.
 * Supports multi-tenancy uniqueness scoping.
 */

import { createWidget } from "@src/widgets/widget-factory";
import {
  type BaseIssue,
  type BaseSchema,
  maxLength,
  minLength,
  optional,
  pipe,
  record,
  string,
  transform,
  regex,
} from "valibot";
import type { FieldInstance } from "@src/content/types";

// Type for aggregation field parameter
interface AggregationField {
  db_fieldName: string;
  [key: string]: unknown;
}

export interface SlugProps {
  // Character counting
  count?: boolean;
  maxLength?: number;
  minLength?: number;
  placeholder?: string;
  prefix?: string;
  suffix?: string;

  // Uniqueness control
  unique?: boolean;
  disableUnique?: boolean;
  tenantScopedUnique?: boolean;

  // Slug-specific
  targetField?: string; // Field to auto-generate from

  // Index signature for WidgetProps constraint
  [key: string]: unknown;
}

// ✅ SSOT: Validation Schema
export const createValidationSchema = (
  field: FieldInstance,
): BaseSchema<unknown, unknown, BaseIssue<unknown>> => {
  const stringRules: unknown[] = [
    transform((s: string) => (typeof s === "string" ? s.trim().toLowerCase() : s)),
    regex(
      /^[a-z0-9-_]*$/,
      "Slug must only contain lowercase letters, numbers, hyphens, and underscores.",
    ),
  ];

  if (field.required) {
    stringRules.push(minLength(1, "This field is required."));
  }

  const props = field as unknown as SlugProps;
  if (props.minLength) {
    stringRules.push(minLength(props.minLength, `Must be at least ${props.minLength} characters.`));
  }
  if (props.maxLength) {
    stringRules.push(
      maxLength(props.maxLength, `Must be no more than ${props.maxLength} characters.`),
    );
  }

  const schema: BaseSchema<unknown, unknown, BaseIssue<unknown>> = pipe(
    string(),
    ...(stringRules as unknown as []),
  );

  if (field.translated) {
    return optional(record(string(), string()), {});
  }

  return field.required ? schema : optional(schema, "");
};

// Create the widget definition using the factory.
const SlugWidget = createWidget<SlugProps>({
  Name: "Slug",
  Icon: "mdi:link-variant",
  Description: "URL-friendly identifier generated from text content.",
  inputComponent: () => import("../input/input.svelte"), // Reuse Input component for now
  inputComponentPath: "/src/widgets/core/input/input.svelte",
  displayComponent: () => import("../input/display.svelte"),
  displayComponentPath: "/src/widgets/core/input/display.svelte",

  validationSchema: createValidationSchema,

  // Set widget-specific defaults.
  defaults: {
    translated: false,
    unique: true,
    tenantScopedUnique: true,
  },

  // Define the UI for configuring this widget in the Collection Builder.
  GuiSchema: {
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    required: { widget: "Toggles", required: false },
    translated: { widget: "Toggles", required: false },
    unique: { widget: "Toggles", required: false },
    disableUnique: { widget: "Toggles", required: false },
    tenantScopedUnique: { widget: "Toggles", required: false },
    targetField: {
      widget: "Input",
      required: false,
      helper: "Field to auto-generate slug from (e.g. title)",
    },
    placeholder: { widget: "Input", required: false },
    minLength: { widget: "Input", required: false },
    maxLength: { widget: "Input", required: false },
    prefix: { widget: "Input", required: false },
    suffix: { widget: "Input", required: false },
  },

  // Aggregations for text search and sorting.
  aggregations: {
    filters: async ({
      field,
      filter,
      contentLanguage,
    }: {
      field: AggregationField;
      filter: string;
      contentLanguage: string;
    }) => [
      {
        $match: {
          [field.translated ? `${field.db_fieldName}.${contentLanguage}` : field.db_fieldName]: {
            $regex: filter,
            $options: "i",
          },
        },
      },
    ],
    sorts: async ({
      field,
      sortDirection,
      contentLanguage,
    }: {
      field: AggregationField;
      sortDirection: number;
      contentLanguage: string;
    }) => ({
      [field.translated ? `${field.db_fieldName}.${contentLanguage}` : field.db_fieldName]:
        sortDirection,
    }),
  },

  GraphqlSchema: () => ({
    typeID: "String",
    graphql: "",
  }),

  jsonRender: true,
});

export default SlugWidget;
