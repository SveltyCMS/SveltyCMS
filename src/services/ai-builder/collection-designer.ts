/**
 * @file src/services/ai-builder/collection-designer.ts
 * @description AI-assisted collection design & refinement service (Phase 0).
 *
 * Generates validated collection schema proposals for the Collection Designer.
 * Phase 1 adds {@link approveCollection}: validate → AST write → compile/reload.
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
 * - Phase 1 approveCollection writes AST schemas, compiles, and audit-logs
 */

import { AppError, rethrow } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { widgetRegistryService } from "@src/services/core/widget-registry-service";
import { builderAiGateway } from "./gateway";
import { buildDesignCollectionPrompt, buildRefineCollectionPrompt } from "./prompts";
import { validateAgainstRegistry, validateProposal } from "./validator";
import { diffSchema } from "./diff";
import type {
  ApproveCollectionInput,
  ApproveCollectionResult,
  CollectionDesignProposal,
  DesignCollectionInput,
  DesignResult,
} from "./types";
import { generateCollectionSourceFromProposal } from "./schema-ast";

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

/**
 * Persist an approved collection design: validate, write AST schema, compile.
 *
 * Draft-gated (`status: "draft"`) until an editor publishes in Collection Builder.
 * Refuses to overwrite an existing collection file unless `overwrite: true`.
 */
export async function approveCollection(
  input: ApproveCollectionInput,
): Promise<ApproveCollectionResult> {
  const proposal = validateProposal(input.proposal);
  validateAgainstRegistry(proposal, (name) => widgetRegistryService.getWidgetSync(name));

  const fs = await import("node:fs");
  const path = await import("node:path");
  const { getCollectionDisplayPath, getCollectionFilePath, getCollectionsPath } =
    await import("@utils/tenant.server");

  const tenantId = input.tenantId ?? null;
  const collectionPath = getCollectionFilePath(proposal.slug, tenantId);
  const collectionsRoot = getCollectionsPath(tenantId);
  const rel = path.relative(path.resolve(collectionsRoot), path.resolve(collectionPath));
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new AppError("Invalid collection path", 400, "VALIDATION_FAILED");
  }

  const exists = fs.existsSync(collectionPath);
  if (exists && input.overwrite !== true) {
    throw new AppError(
      `A collection named "${proposal.slug}" already exists. Pass overwrite: true to replace it.`,
      409,
      "COLLECTION_EXISTS",
      { slug: proposal.slug },
    );
  }

  const displayPath = getCollectionDisplayPath(proposal.slug, tenantId);
  const source = generateCollectionSourceFromProposal(proposal, {
    displayPath,
    icon: input.icon,
    status: input.status || "draft",
  });

  fs.mkdirSync(path.dirname(collectionPath), { recursive: true });
  fs.writeFileSync(collectionPath, source, "utf-8");

  const { syncContentState } = await import("@src/content/sync-content-state.server");
  const relativeSource = path.basename(collectionPath);
  const syncResult = await syncContentState({
    // A schema write is a collection save: it takes the file-keyed lock and
    // compiles only that file. A bespoke reason would fall through the switch
    // default into a full refresh plus organizational reconciliation.
    reason: "collection-save",
    tenantId,
    targetFile: relativeSource,
    changedFile: collectionPath,
    fullBuild: exists,
  });

  try {
    const { auditService, AuditEventType } = await import("@src/services/security/audit-service");
    await auditService.log(
      "AI Builder approve collection",
      {
        id: (input.userId as never) ?? null,
        email: input.userEmail || "unknown",
        role: input.userRole,
      },
      { type: "collection", id: proposal.slug as never },
      AuditEventType.DATA_IMPORT,
      "medium",
      {
        slug: proposal.slug,
        fieldCount: proposal.fields.length,
        overwritten: exists,
        path: displayPath,
      },
      tenantId as never,
    );
  } catch (err) {
    rethrow(err);
    logger.debug("[CollectionDesigner] audit log skipped", err);
  }

  logger.info(
    `[CollectionDesigner] approved ${proposal.slug} (${proposal.fields.length} fields) in ${syncResult.metrics.totalMs}ms`,
  );

  return {
    collectionId: proposal.slug,
    slug: proposal.slug,
    path: displayPath,
    overwritten: exists,
    contentVersion: syncResult.contentVersion,
  };
}
