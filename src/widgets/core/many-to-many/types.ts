/**
 * @file src/widgets/core/many-to-many/types.ts
 * @description Type definitions for the ManyToMany junction relation widget.
 *
 * @features
 * - Normalized edge storage (one row per link) instead of an in-document id array
 * - Optional per-link metadata (`sort`, `label`, `role`, …) via a through row
 * - Same selection UI as the Relation widget (reuses its input/display)
 */

import type { RelationProps } from "../relation/types";

/** A per-link field declared on the junction edge (documentation/UI hint only). */
export interface ManyToManyMetadataField {
  name: string;
  label?: string;
  widget?: string;
}

export interface ManyToManyProps extends RelationProps {
  /** Always true — a junction relation is many-to-many by definition. */
  multiple: true;
  /**
   * Junction collection id. Defaults to the built-in `contentRelations` table.
   * A custom collection must expose the same columns (`sourceCollection`,
   * `sourceId`, `fieldName`, `targetCollection`, `targetId`, `sortOrder`,
   * `metadata`).
   */
  through?: string;
  /** Optional declaration of the extra per-link fields stored in `metadata`. */
  metadataFields?: ManyToManyMetadataField[];
}
