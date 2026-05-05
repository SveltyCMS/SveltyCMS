/**
 * @file src/widgets/custom/markdown/index.ts
 * @description Markdown Widget Definition.
 */

import { createWidget } from "@src/widgets/widget-factory";
import { nullable, string } from "valibot";

export interface MarkdownProps {
  label: string;
  db_fieldName?: string;
  required?: boolean;
  translated?: boolean;
  placeholder?: string;
  [key: string]: unknown;
}

const MarkdownWidget = createWidget<MarkdownProps>({
  Name: "Markdown",
  Icon: "mdi:language-markdown",
  Description: "High-performance Markdown editor with real-time preview.",
  inputComponentPath: "/src/widgets/custom/markdown/input.svelte",
  displayComponentPath: "/src/widgets/custom/markdown/display.svelte",

  validationSchema: (field: MarkdownProps) => {
    const schema = string();
    return field.required ? schema : nullable(schema);
  },

  defaults: {
    translated: true,
  },

  GuiSchema: {
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    required: { widget: "Toggles" },
    translated: { widget: "Toggles" },
    placeholder: { widget: "Input" },
  },

  jsonRender: true,
});

export default MarkdownWidget;
export type FieldType = ReturnType<typeof MarkdownWidget>;
