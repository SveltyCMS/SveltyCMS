/**
 * @file src/widgets/custom/json-editor/index.ts
 * @description JSON Editor Widget - Advanced data structure management.
 */

import { createWidget } from "@src/widgets/widget-factory";
import { any, nullable } from "valibot";

export interface JsonEditorProps {
  label: string;
  db_fieldName?: string;
  required?: boolean;
  height?: string;
  readOnly?: boolean;
  mode?: "tree" | "code" | "text";
  [key: string]: unknown;
}

const JsonEditorWidget = createWidget<JsonEditorProps>({
  Name: "JsonEditor",
  Icon: "mdi:json",
  Description: "Structured JSON data editor with syntax highlighting.",
  inputComponentPath: "/src/widgets/custom/json-editor/input.svelte",
  displayComponentPath: "/src/widgets/custom/json-editor/display.svelte",

  validationSchema: (field: JsonEditorProps) => {
    return field.required ? any() : nullable(any());
  },

  defaults: {
    height: "300px",
    mode: "code",
  },

  GuiSchema: {
    label: { widget: "Input", required: true },
    height: { widget: "Input", placeholder: "300px" },
    mode: {
      widget: "Select",
      options: [
        { label: "Code", value: "code" },
        { label: "Tree", value: "tree" },
      ],
    },
    required: { widget: "Toggles" },
  },

  jsonRender: true,

  modifyRequest: async ({ data, type }: any) => {
    if (type === "POST" || type === "PATCH") {
      if (import.meta.env.SSR) {
        const { checkExtensionLicense } = await import("@src/utils/license-manager");
        const status = await checkExtensionLicense("widget", "json-editor");
        if (!status.active && !status.hasLicense) {
          throw new Error("403 Forbidden: Premium License Required for JSON Editor Widget");
        }
      }
    }
    return data;
  },
});

export default JsonEditorWidget;
export type FieldType = ReturnType<typeof JsonEditorWidget>;
