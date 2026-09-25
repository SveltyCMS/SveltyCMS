/**
 * @file src/plugins/webmcp/tools/builder.server.ts
 * @description Server-side (headless) WebMCP builder tools.
 *
 * Server-only counterpart of `builder.ts`. The tool implementations import
 * server services (`collection-designer`, `widget-scaffolder`, …) that transitively
 * pull in `*.server.ts` modules and Node builtins, so this module must never be
 * reachable from client code — SvelteKit's server-module guard rejects that.
 * Register it from a server-only entry point (or a test), never from a `.svelte`
 * module.
 *
 * ### Features:
 * - Natural-language collection design (`design_collection`)
 * - Iterative schema refinement (`refine_collection`)
 * - Structural AST schema diffing (`diff_collection_schema`)
 * - 3-pillar custom widget scaffolding (`scaffold_widget`)
 * - Widget registry discovery (`list_available_widgets`)
 * - Enforces the Draft-by-Default Airgap (proposals must be approved in admin GUI)
 */

import { logger } from "@utils/logger";
import { registerServerTool, syncHeadlessToolBag } from "../tool-registry";
import { designCollection, refineCollection } from "@src/services/ai-builder/collection-designer";
import { diffSchema } from "@src/services/ai-builder/diff";
import { widgetRegistryService } from "@src/services/core/widget-registry-service";
import {
  generateWidget,
  type WidgetScaffoldConfig,
} from "@src/services/intelligence/ai-codegen/widget-scaffolder";
import type {
  CollectionDesignProposal,
  DesignCollectionInput,
} from "@src/services/ai-builder/types";

/**
 * Generates a collection schema proposal using the Builder AI Gateway.
 */
async function designCollectionTool(input: DesignCollectionInput & { userId?: string }) {
  try {
    const result = await designCollection(input, input.userId ?? "webmcp-agent");
    return {
      success: true,
      proposal: result.proposal,
      diff: result.diff,
      message:
        "Collection proposal drafted successfully. Airgap enforced: Admin review required via Collection Builder GUI to compile.",
    };
  } catch (err: unknown) {
    logger.error("[WebMCP] design_collection failed", { error: err });
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Refines an existing collection proposal using natural language instructions.
 */
async function refineCollectionTool(input: {
  previousProposal: CollectionDesignProposal;
  instruction: string;
  userId?: string;
}) {
  try {
    const result = await refineCollection(
      {
        prompt: input.instruction,
        previousProposal: input.previousProposal,
      },
      input.userId ?? "webmcp-agent",
    );
    return {
      success: true,
      proposal: result.proposal,
      diff: result.diff,
      message: "Collection proposal refined successfully.",
    };
  } catch (err: unknown) {
    logger.error("[WebMCP] refine_collection failed", { error: err });
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Diffs two schema representations to inspect pending additions, modifications, or deletions.
 */
function diffCollectionSchemaTool(input: {
  current: CollectionDesignProposal | null;
  proposal: CollectionDesignProposal;
}) {
  try {
    const diff = diffSchema(input.current, input.proposal);
    return {
      success: true,
      diff,
    };
  } catch (err: unknown) {
    logger.error("[WebMCP] diff_collection_schema failed", { error: err });
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Scaffolds a 3-pillar custom widget (index.ts, input.svelte, display.svelte)
 * with Tailwind CSS v4 and Svelte 5 runes.
 */
async function scaffoldWidgetTool(config: WidgetScaffoldConfig) {
  try {
    const result = await generateWidget(config);
    return {
      success: true,
      widgetName: config.name,
      writtenFiles: ["index.ts", "input.svelte", "display.svelte"],
      message: `Widget "${config.name}" scaffolded into ${result.outputDir}`,
    };
  } catch (err: unknown) {
    logger.error("[WebMCP] scaffold_widget failed", { error: err });
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Lists all available widgets currently registered in SveltyCMS.
 */
async function listAvailableWidgetsTool() {
  try {
    const widgets = await widgetRegistryService.getAllWidgets();
    const list = [...widgets.values()].map((w) => ({
      name: w.Name,
      label: w.Name,
      description: w.Description ?? "",
      icon: w.Icon ?? "",
      category: w.__widgetType ?? "core",
    }));
    return {
      success: true,
      total: list.length,
      widgets: list,
    };
  } catch (err: unknown) {
    logger.error("[WebMCP] list_available_widgets failed", { error: err });
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Register the headless builder tools with the server tool registry. */
export function registerBuilderServerTools(): void {
  registerServerTool({
    name: "design_collection",
    description:
      "Generate a full SveltyCMS collection schema proposal from natural language (Draft-by-Default Airgap)",
    parameters: {
      prompt: "Natural language description of the content model and required fields",
      name: "Optional collection slug/name",
      description: "Optional collection description",
      language: "Optional language code (e.g. en, de)",
    },
    handler: designCollectionTool,
  });

  registerServerTool({
    name: "refine_collection",
    description: "Refine an existing collection proposal using natural language instructions",
    parameters: {
      previousProposal: "The CollectionDesignProposal to refine",
      instruction: "Modification instructions (e.g. 'add tags field', 'make title required')",
    },
    handler: refineCollectionTool,
  });

  registerServerTool({
    name: "diff_collection_schema",
    description: "Compare an existing collection schema against an AI proposal",
    parameters: {
      current: "The current CollectionDesignProposal or null if creating new",
      proposal: "The proposed CollectionDesignProposal",
    },
    handler: diffCollectionSchemaTool,
  });

  registerServerTool({
    name: "scaffold_widget",
    description:
      "Scaffold complete 3-pillar Svelte 5 widget files (definition, input.svelte, display.svelte)",
    parameters: {
      name: "PascalCase widget name",
      label: "Human-readable label",
      description: "Short description of what the widget does",
      fields: "Array of fields exposed to content editors",
    },
    handler: scaffoldWidgetTool,
  });

  registerServerTool({
    name: "list_available_widgets",
    description: "List all widgets currently registered in the SveltyCMS widget registry",
    handler: listAvailableWidgetsTool,
  });

  syncHeadlessToolBag();
}
