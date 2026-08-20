/**
 * @file src/services/ai-builder/index.ts
 * @description Public entry point for the AI-Assisted Builder (Phase 0).
 *
 * Named exports only — tree-shaking friendly. The API layer consumes the
 * stable contract defined here:
 * - types: proposal/diff/input/result shapes
 * - gateway: backend routing + quotas
 * - prompts: injection-shielded prompt templates
 * - validator: structured-output validation
 * - diff: schema diffing for the approval UI
 * - collection-designer: designCollection / refineCollection services
 *
 * ### Features:
 * - stable public surface for API consumers
 * - no side effects beyond constructing the lazy default gateway singleton
 */

export type {
  ProposalField,
  CollectionDesignProposal,
  SchemaDiff,
  DesignCollectionInput,
  DesignResult,
} from "./types";

export type { ModelBackend, BuilderAiGatewayOptions } from "./gateway";
export { BuilderAiGateway, builderAiGateway } from "./gateway";

export {
  shieldUserData,
  buildDesignCollectionPrompt,
  buildRefineCollectionPrompt,
} from "./prompts";

export { RESERVED_FIELD_NAMES, validateProposal, validateAgainstRegistry } from "./validator";

export { diffSchema } from "./diff";

export { designCollection, refineCollection } from "./collection-designer";
