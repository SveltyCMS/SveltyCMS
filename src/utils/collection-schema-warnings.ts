/**
 * @file src/utils/collection-schema-warnings.ts
 * @description Shared breaking-change types for collection schema comparison.
 * Consumed by the collection builder, compile-time warnings, and schema-impact scoring.
 *
 * ### Features:
 * - Typed breaking-change categories (removed, renamed, type, required, unique)
 * - Data-loss and mitigation context for each change
 * - Aggregate diff shape (`SchemaDiffResult`)
 */

/**
 * Types of breaking changes that can occur when a schema is modified
 */
export type BreakingChangeType =
  | "field_removed" // Field was deleted - data will be lost
  | "field_renamed" // Field name changed - data orphaned
  | "type_changed" // Widget type changed - potential data corruption
  | "required_added" // New required field - existing entries become invalid
  | "unique_added"; // New unique constraint - may cause conflicts

/**
 * Represents a breaking change between two schema versions
 */
export interface BreakingChange {
  /** Whether this change will cause data loss */
  dataLoss: boolean;
  /** Database field name affected */
  fieldName: string;
  /** Human-readable message explaining the change */
  message: string;
  /** New value (for context) */
  newValue?: unknown;
  /** Previous value (for context) */
  oldValue?: unknown;
  /** Suggested action to mitigate the change */
  suggestion?: string;
  /** Type of breaking change */
  type: BreakingChangeType;
}

/**
 * Detailed diff result between two schemas
 */
export interface SchemaDiffResult {
  /** List of breaking changes detected */
  breakingChanges: BreakingChange[];
  /** Whether any changes will cause data loss */
  hasDataLoss: boolean;
  /** Whether any changes require user acknowledgment */
  requiresConfirmation: boolean;
  /** Summary message for display */
  summary: string;
}
