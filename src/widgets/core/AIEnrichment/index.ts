/**
 * @file src/widgets/core/ai-enrichment/index.ts
 * @description AI Enrichment Widget - Automates content tasks via local/remote AI
 */

import { createWidget } from "@src/widgets/widget-factory";
import { optional, record, string, type BaseIssue, type BaseSchema } from "valibot";
import type { AIEnrichmentProps } from "./types";

// Validation Schema
export const createValidationSchema = (
  field: any,
): BaseSchema<unknown, unknown, BaseIssue<unknown>> => {
  if (field.translated) {
    return optional(record(string(), string()), {});
  }
  return optional(string(), "");
};

const AIEnrichmentWidget = createWidget<AIEnrichmentProps>({
  Name: "AIEnrichment",
  Icon: "mdi:auto-fix",
  Description: "Automated content enrichment (Summarization, SEO, Translation) via AI",
  inputComponent: () => import("./input.svelte"),
  inputComponentPath: "/src/widgets/core/AIEnrichment/input.svelte",
  displayComponent: () => import("./display.svelte"),
  displayComponentPath: "/src/widgets/core/AIEnrichment/display.svelte",

  validationSchema: createValidationSchema,

  defaults: {
    action: "summarize",
    translated: true,
    autoRun: false,
  },

  GuiSchema: {
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    sourceField: { widget: "Input", required: true }, // Ideally a select of other fields
    action: {
      widget: "Select",
      required: true,
      options: [
        { label: "Summarize", value: "summarize" },
        { label: "SEO Meta Description", value: "seo" },
        { label: "Keywords Extraction", value: "keywords" },
        { label: "Translation", value: "translate" },
        { label: "Custom Prompt", value: "custom" },
      ],
    },
    customPrompt: { widget: "Input", required: false },
    autoRun: { widget: "Toggles", required: false },
    translated: { widget: "Toggles", required: false },
    required: { widget: "Toggles", required: false },
    helper: { widget: "Input", required: false },
    width: { widget: "Input", required: false },
  },

  jsonRender: true,
});

export default AIEnrichmentWidget;
export type FieldType = ReturnType<typeof AIEnrichmentWidget>;
