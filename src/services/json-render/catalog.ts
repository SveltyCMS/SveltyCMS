/**
 * @file src/lib/json-render/catalog.ts
 * @description Central catalog for AI-native generative layouts using json-render-svelte.
 */

import { schema, defineRegistry } from "json-render-svelte";
import type { WidgetDefinition } from "@widgets/types";
import { logger } from "@utils/logger";
import { getComponentLoader } from "@src/widgets/scanner";

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
export async function registerForJsonRender(widget: WidgetDefinition): Promise<void> {
  if (!widget.jsonRender) return;

  // 1. Add to the catalog schema so AI knows it exists (synchronous)
  (sveltyCatalog.data as any).components[widget.Name] = {
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
      sveltyRegistry[widget.Name] = mod.default;
    } catch (err) {
      logger.debug(`[JsonRender] Failed to load display component for ${widget.Name}:`, err);
      sveltyRegistry[widget.Name] = Text;
    }
  } else {
    sveltyRegistry[widget.Name] = Text;
  }
}
