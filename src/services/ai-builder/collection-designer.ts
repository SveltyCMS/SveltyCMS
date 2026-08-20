/**
 * @file src/services/ai-builder/collection-designer.ts
 * @description AI-assisted collection design & refinement service (Phase 0).
 *
 * Generates validated collection schema proposals for the Collection Designer.
 * The approval/write path is explicitly out of scope — this module only
 * produces proposals (plus an optional diff against the current schema) and
 * throws clean AppErrors for the API layer to map to responses.
 *
 * Pipeline: quota check → prompt build (injection-shielded) → gateway
 * (backends in order) → output validation (shape + reserved names + slug) →
 * widget registry validation → allowlist enforcement → diff.
 *
 * ### Features:
 * - deterministic failure surface (AppError codes: RATE_LIMITED,
 *   AI_UNAVAILABLE, AI_OUTPUT_INVALID, VALIDATION_FAILED)
 * - registry-derived widget allowlist when none is provided
 * - caller-provided allowlist is enforced on the produced proposal
 */

import { AppError, rethrow } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { widgetRegistryService } from "@src/services/core/widget-registry-service";
import { builderAiGateway } from "./gateway";
import { buildDesignCollectionPrompt, buildRefineCollectionPrompt } from "./prompts";
import { validateAgainstRegistry, validateProposal } from "./validator";
import { diffSchema } from "./diff";
import type { CollectionDesignProposal, DesignCollectionInput, DesignResult } from "./types";

/** Registry-derived widget names used as the default allowlist for prompts. */
async function resolveRegistryWidgetNames(): Promise<string[]> {
  try {
    const widgets = await widgetRegistryService.getAllWidgets();
    return [...widgets.keys()];
  } catch (err) {
    rethrow(err);
    logger.warn("[CollectionDesigner] could not derive widget list from the registry", err);
    return [];
  }
}

/**
 * Shared pipeline for design and refine flows.
 */
async function runDesign(
  input: DesignCollectionInput,
  userId: string | undefined,
  mode: "design" | "refine",
  previousProposal?: CollectionDesignProposal,
): Promise<DesignResult> {
  const gateway = builderAiGateway;
  gateway.checkQuota(userId ?? "system");

  // Explicit caller allowlist wins; otherwise derive the default from the registry.
  const explicitAllowlist =
    input.availableWidgets && input.availableWidgets.length > 0
      ? input.availableWidgets
      : undefined;
  const resolvedAllowlist = explicitAllowlist ?? (await resolveRegistryWidgetNames());

  const promptInput: DesignCollectionInput = { ...input, availableWidgets: resolvedAllowlist };
  const systemPrompt =
    mode === "design"
      ? buildDesignCollectionPrompt(promptInput)
      : buildRefineCollectionPrompt({
          ...promptInput,
          previousProposal: previousProposal as CollectionDesignProposal,
        });

  const detailed = await gateway.generateStructuredDetailed<unknown>(systemPrompt);
  if (!detailed) {
    throw new AppError(
      "AI provider unavailable: no model backend returned a valid structured response. Verify that the configured AI backend (e.g. Ollama) is running and reachable.",
      503,
      "AI_UNAVAILABLE",
    );
  }

  // Fail closed on everything the model produced.
  const proposal = validateProposal(detailed.value);
  validateAgainstRegistry(proposal, (name) => widgetRegistryService.getWidgetSync(name));

  // A caller-provided allowlist is a hard constraint on the output.
  if (explicitAllowlist) {
    const allowed = new Set(explicitAllowlist);
    const outsideAllowlist = [
      ...new Set(
        proposal.fields.filter((field) => !allowed.has(field.widget)).map((field) => field.widget),
      ),
    ];
    if (outsideAllowlist.length > 0) {
      throw new AppError(
        `The AI proposal uses widgets outside the requested allowlist: ${outsideAllowlist
          .map((widget) => `"${widget}"`)
          .join(", ")}.`,
        400,
        "VALIDATION_FAILED",
        { widgets: outsideAllowlist },
      );
    }
  }

  const result: DesignResult = { proposal, backend: detailed.backend };
  if (input.existingSchema != null) {
    result.diff = diffSchema(input.existingSchema, proposal);
  }
  return result;
}

/**
 * Generate a fresh collection design proposal from a natural-language prompt.
 */
export async function designCollection(
  input: DesignCollectionInput,
  userId?: string,
): Promise<DesignResult> {
  return runDesign(input, userId, "design");
}

/**
 * Refine a previously generated proposal based on a follow-up prompt.
 */
export async function refineCollection(
  input: DesignCollectionInput & { previousProposal: CollectionDesignProposal },
  userId?: string,
): Promise<DesignResult> {
  return runDesign(input, userId, "refine", input.previousProposal);
}
