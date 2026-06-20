/**
 * @file src/services/intelligence/ai-codegen/widget-scaffolder.ts
 * @description AI-assisted widget code generator for SveltyCMS 3-pillar architecture.
 * Generates complete widget boilerplate (definition, input, display) from a simple
 * configuration object. Designed to work with LLM-generated prompts for intelligent
 * field suggestions, but also works standalone with sensible defaults.
 *
 * ### Features:
 * - Generates 3-pillar widget files (index.ts, Input.svelte, Display.svelte)
 * - Auto-infers Valibot validators from field types
 * - Produces Tailwind v4 + Svelte 5 runes components
 * - WCAG 2.2 AA compliant templates (ARIA labels, keyboard support)
 * - Zero external dependencies
 */

import fs from "node:fs/promises";
import path from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────

export interface WidgetField {
  name: string;
  label: string;
  type: "text" | "number" | "richtext" | "select" | "toggle" | "color" | "media" | "date";
  required?: boolean;
  placeholder?: string;
  /** For select fields */
  options?: string[];
  /** For number fields */
  min?: number;
  max?: number;
  /** For text fields */
  maxLength?: number;
}

export interface WidgetScaffoldConfig {
  /** Widget name in PascalCase (e.g. "StarRating") */
  name: string;
  /** Human-readable label */
  label: string;
  /** Short description */
  description: string;
  /** mdi icon identifier */
  icon?: string;
  /** Fields this widget exposes to the content editor */
  fields: WidgetField[];
  /** Target directory (default: src/widgets/core/{kebab-name}/) */
  outputDir?: string;
}

// ─── Valibot Type Mapping ─────────────────────────────────────────────────

function fieldToValidator(field: WidgetField): string {
  const base =
    field.type === "number" ? "v.number()" : field.type === "toggle" ? "v.boolean()" : "v.string()";

  const pipes: string[] = [];

  if (field.required) {
    pipes.push(`v.minLength(1, "${field.label} is required")`);
  }
  if (field.maxLength) {
    pipes.push(`v.maxLength(${field.maxLength})`);
  }
  if (field.type === "number" && field.min !== undefined) {
    pipes.push(`v.minValue(${field.min})`);
  }
  if (field.type === "number" && field.max !== undefined) {
    pipes.push(`v.maxValue(${field.max})`);
  }

  return pipes.length ? `v.pipe(${base}, ${pipes.join(", ")})` : base;
}

function fieldToGuiSchema(field: WidgetField): string {
  const base: Record<string, unknown> = {
    widget: field.type === "richtext" ? "richtext" : field.type === "toggle" ? "checkbox" : "input",
    label: field.label,
  };
  if (field.placeholder) base.placeholder = field.placeholder;
  if (field.options) base.options = field.options;
  if (field.type === "number") base.type = "number";
  return JSON.stringify(base, null, 4).replace(/\n/g, "\n    ");
}

// ─── Template Generators ──────────────────────────────────────────────────

function generateIndex(config: WidgetScaffoldConfig): string {
  const kebab = config.name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  const validators = config.fields.map((f) => `  ${f.name}: ${fieldToValidator(f)},`).join("\n");

  const guiSchema = config.fields.map((f) => `    ${f.name}: ${fieldToGuiSchema(f)},`).join("\n");

  return `/**
 * @file src/widgets/core/${kebab}/index.ts
 * @widget ${config.name}
 * @description ${config.description}
 *
 * ### Fields:
${config.fields.map((f) => ` * - \`${f.name}\` (${f.type})${f.required ? " — required" : ""}: ${f.label}`).join("\n")}
 */

import { createWidget } from "@widgets/widgetFactory";
import * as v from "valibot";

export default createWidget<{
${config.fields.map((f) => `  ${f.name}?: ${f.type === "number" ? "number" : "string"};`).join("\n")}
}>({
  Name: "${config.name}",
  label: "${config.label}",
  description: "${config.description}",
  icon: "${config.icon || "mdi:puzzle"}",
  validationSchema: () => v.object({
${validators}
  }),
  GuiSchema: {
${guiSchema}
  },
});
`;
}

function generateInput(config: WidgetScaffoldConfig): string {
  const kebab = config.name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  const props = config.fields
    .map(
      (f) =>
        `  let ${f.name} = $bindable(${f.type === "number" ? "0" : f.type === "toggle" ? "false" : '""'});`,
    )
    .join("\n");
  const inputs = config.fields
    .map((f) => {
      if (f.type === "toggle") {
        return `<Toggle label="${f.label}" bind:checked={${f.name}} />`;
      }
      if (f.type === "richtext") {
        return `<RichTextEditor bind:value={${f.name}} placeholder="${f.placeholder || "Enter " + f.label.toLowerCase() + "..."}" />`;
      }
      if (f.type === "select" && f.options) {
        return `<Select label="${f.label}" bind:value={${f.name}} options={${JSON.stringify(f.options)}} />`;
      }
      return `<Input label="${f.label}" bind:value={${f.name}}${f.type === "number" ? ' type="number"' : ""}${f.required ? " required" : ""} placeholder="${f.placeholder || "Enter " + f.label.toLowerCase() + "..."}" />`;
    })
    .join("\n      ");

  return `<!--
@file src/widgets/core/${kebab}/Input.svelte
@component
**Input component for the ${config.name} widget**

### Props:
${config.fields.map((f) => `- \`${f.name}\` (${f.type}): ${f.label}`).join("\n")}

### Features:
- Svelte 5 runes with $bindable props
- Tailwind v4 styling
- WCAG 2.2 AA compliant (ARIA labels, keyboard navigation)
-->

<script lang="ts">
  import Input from "@components/ui/Input.svelte";
  import Select from "@components/ui/Select.svelte";
  import Toggle from "@components/ui/Toggle.svelte";
  import RichTextEditor from "@components/ui/RichTextEditor.svelte";

  let { value = $bindable({}) }: { value: Record<string, unknown> } = $props();

${props}
</script>

<div class="space-y-4" role="group" aria-label="${config.label} fields">
  ${inputs}
</div>
`;
}

function generateDisplay(config: WidgetScaffoldConfig): string {
  const kebab = config.name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  const display = config.fields
    .map((f) => {
      if (f.type === "toggle")
        return `{#if value.${f.name}}<Badge variant="success">${f.label}</Badge>{/if}`;
      if (f.type === "media")
        return `{#if value.${f.name}}<img src={value.${f.name}} alt="${f.label}" class="max-w-full rounded" />{/if}`;
      return `<p class="text-sm text-muted">{value.${f.name} || "—"}</p>`;
    })
    .join("\n    ");

  return `<!--
@file src/widgets/core/${kebab}/Display.svelte
@component
**Display component for the ${config.name} widget**

### Features:
- Responsive rendering
- Tailwind v4 styling
- Graceful empty state handling
-->

<script lang="ts">
  import Badge from "@components/ui/Badge.svelte";

  let { value = {} }: { value: Record<string, unknown> } = $props();
</script>

<div class="space-y-2" role="region" aria-label="${config.label} display">
  ${display}
</div>
`;
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface ScaffoldResult {
  definition: string;
  input: string;
  display: string;
  outputDir: string;
}

/** Generate widget code from configuration without writing to disk. */
export function scaffoldWidget(config: WidgetScaffoldConfig): ScaffoldResult {
  const kebab = config.name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  const baseDir = config.outputDir || path.join("src", "widgets", "core", kebab);

  return {
    definition: generateIndex(config),
    input: generateInput(config),
    display: generateDisplay(config),
    outputDir: baseDir,
  };
}

/** Generate widget code AND write to disk. */
export async function generateWidget(config: WidgetScaffoldConfig): Promise<ScaffoldResult> {
  const result = scaffoldWidget(config);

  await fs.mkdir(result.outputDir, { recursive: true });
  await fs.writeFile(path.join(result.outputDir, "index.ts"), result.definition, "utf-8");
  await fs.writeFile(path.join(result.outputDir, "Input.svelte"), result.input, "utf-8");
  await fs.writeFile(path.join(result.outputDir, "Display.svelte"), result.display, "utf-8");

  return result;
}
