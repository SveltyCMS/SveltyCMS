/**
 * @file src/services/ai-builder/types.ts
 * @description Shared types for the SveltyCMS AI-Assisted Builder (Phase 0).
 *
 * Defines the stable contract consumed by the API layer:
 * - Collection design proposals produced by model backends.
 * - Schema diff shapes for the pre-approval review UI.
 * - Design/refine service inputs and results.
 *
 * ### Features:
 * - backend-agnostic structured output contract
 * - schema diff model for pre-approval review
 * - optional widget allowlist for constrained generation
 */

/** A single field proposed by the AI for a collection schema. */
export interface ProposalField {
  /** db_fieldName (camelCase, unique) */
  name: string;
  /** Human-readable display label. */
  label?: string;
  /** Must exist in the widget registry. */
  widget: string;
  /** Value type: string | number | boolean | richtext | ... */
  type?: string;
  required?: boolean;
  translated?: boolean;
  validation?: Record<string, unknown>;
}

/** A complete collection schema design produced by a model backend. */
export interface CollectionDesignProposal {
  name: string;
  slug: string;
  label: string;
  description?: string;
  fields: ProposalField[];
  rationale?: string[];
}

/**
 * Structural difference between an existing collection schema and a proposal.
 * Computed by {@link diffSchema} and shown to the user before approval.
 */
export interface SchemaDiff {
  added: ProposalField[];
  removed: { name: string }[];
  changed: { name: string; before: unknown; after: ProposalField }[];
}

/** Input for {@link designCollection}. */
export interface DesignCollectionInput {
  prompt: string;
  tenantId?: string | null;
  /** Current collection schema (for diff). */
  existingSchema?: unknown;
  /** Desired label language, e.g. "de". */
  language?: string;
  /** Optional allowlist; defaults to registry-derived list. */
  availableWidgets?: string[];
}

/** Result of a design/refine generation call. */
export interface DesignResult {
  proposal: CollectionDesignProposal;
  diff?: SchemaDiff;
  /** Name of the model backend that produced it. */
  backend: string;
}
