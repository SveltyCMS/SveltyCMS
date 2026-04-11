/**
 * @file src/lib/json-render/catalog.ts
 * @description Central catalog for AI-native generative layouts using json-render-svelte.
 */

import { schema, defineRegistry } from "json-render-svelte";
import type { WidgetDefinition } from "@widgets/types";

// Import basic components
import VerticalLayout from "./components/vertical-layout.svelte";
import HorizontalLayout from "./components/horizontal-layout.svelte";
import Text from "./components/text.svelte";

// The unified catalog containing all AI-generatable components.
export const sveltyCatalog = schema.createCatalog({
  components: {},
  actions: {},
});

// The registry that maps component names to Svelte components.
const { registry } = defineRegistry(sveltyCatalog as any, {
  components: {
    VerticalLayout: VerticalLayout as any,
    HorizontalLayout: HorizontalLayout as any,
    Text: Text as any,
    Control: Text as any, // Fallback Control to Text for now
  },
});

export const sveltyRegistry = registry as any;

/**
 * Registers a widget into the generative catalog.
 */
export function registerForJsonRender(widget: WidgetDefinition) {
  if (!widget.jsonRender) return;

  // 1. Add to the catalog schema so AI knows it exists
  (sveltyCatalog.data as any).components[widget.Name] = {
    props: {
      value: { type: "any" },
      field: { type: "object" },
    },
  };

  // 2. Add to the registry so it can be rendered
  // We use the displayComponent if available, or text fallback
  if (widget.displayComponent) {
    sveltyRegistry[widget.Name] = widget.displayComponent;
  } else {
    sveltyRegistry[widget.Name] = Text;
  }

  // console.log(`[JsonRender] Registered widget: ${widget.Name}`);
}
