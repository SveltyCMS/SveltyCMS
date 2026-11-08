/**
 * @file src/services/json-render/catalog.ts
 * @description Native Svelte 5 + Valibot catalog and types for AI-native generative layouts.
 *
 * Features:
 * - Zero `json-render-svelte` / `zod` dependency footprint
 * - Valibot `SpecSchema` + `validateSpec()` for runtime AI spec validation
 * - Lazy Vite display component loading via `getComponentLoader()`
 */

import type { Component, Snippet } from "svelte";
import { array, boolean, object, optional, record, safeParse, string, unknown } from "valibot";
import type { WidgetDefinition } from "@widgets/types";
import { logger } from "@utils/logger";
import { getComponentLoader } from "@src/widgets/scanner";

// Import basic components
import VerticalLayout from "./components/vertical-layout.svelte";
import HorizontalLayout from "./components/horizontal-layout.svelte";
import Text from "./components/text.svelte";

/**
 * Single node in an AI-generated layout specification.
 * Supports both `{ props, children }` and JSON-Forms-style `{ elements, label, options }`.
 */
export interface UIElement {
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
  elements?: string[];
  visible?: boolean;
  label?: string;
  scope?: string;
  options?: Record<string, unknown>;
}

/**
 * Root AI-generated layout specification.
 */
export interface Spec {
  root: string;
  elements: Record<string, UIElement>;
}

/**
 * Props passed to registered generative layout components.
 */
export interface ComponentRenderProps {
  element?: UIElement;
  children?: Snippet;
  loading?: boolean;
  emit?: (eventName: string) => void;
  bindings?: Record<string, string>;
}

/**
 * Valibot schema for validating AI-generated layout specs.
 */
const UIElementSchema = object({
  type: string(),
  props: optional(record(string(), unknown())),
  children: optional(array(string())),
  elements: optional(array(string())),
  visible: optional(boolean()),
  label: optional(string()),
  scope: optional(string()),
  options: optional(record(string(), unknown())),
});

const SpecSchema = object({
  root: string(),
  elements: record(string(), UIElementSchema),
});

/**
 * Validates an untrusted AI payload against `SpecSchema`.
 */
export function validateSpec(input: unknown): Spec | null {
  const result = safeParse(SpecSchema, input);
  return result.success ? (result.output as Spec) : null;
}

// The unified catalog containing all AI-generatable components.
const sveltyCatalog = {
  data: {
    components: {} as Record<string, unknown>,
    actions: {} as Record<string, unknown>,
  },
};

// The registry that maps component names to Svelte components.
export const sveltyRegistry: Record<string, Component<ComponentRenderProps>> = {
  VerticalLayout: VerticalLayout as Component<ComponentRenderProps>,
  HorizontalLayout: HorizontalLayout as Component<ComponentRenderProps>,
  Text: Text as Component<ComponentRenderProps>,
  Control: Text as Component<ComponentRenderProps>,
};

/**
 * Registers a widget into the generative catalog.
 */
export async function registerForJsonRender(widget: WidgetDefinition): Promise<void> {
  if (!widget.jsonRender) return;

  // 1. Add to the catalog schema so AI knows it exists (synchronous)
  sveltyCatalog.data.components[widget.Name] = {
    props: {
      value: { type: "any" },
      field: { type: "object" },
    },
  };

  // 2. Resolve the widget's actual display component lazily using Vite-bundled chunk loaders.
  const loader = getComponentLoader(widget.Name, "display");
  if (loader) {
    try {
      const mod = await loader();
      sveltyRegistry[widget.Name] = mod.default as Component<ComponentRenderProps>;
    } catch (err) {
      logger.debug(`[JsonRender] Failed to load display component for ${widget.Name}:`, err);
      sveltyRegistry[widget.Name] = Text as Component<ComponentRenderProps>;
    }
  } else {
    sveltyRegistry[widget.Name] = Text as Component<ComponentRenderProps>;
  }
}
