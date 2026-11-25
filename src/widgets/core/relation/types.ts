/**
 * @file src/widgets/core/relation/types.ts
 * @description Type definitions for the Relation and RelationList widgets.
 *
 * @features
 * - **Strongly Typed**: Defines clear configuration options for relationships.
 * - **Modular**: Separates props for single and multiple relation types.
 */

/** Referential action executed when a referenced entry is deleted. */
export type RelationOnDeleteAction = "cascade" | "setNull" | "restrict";

// Defines the properties unique to the Relation & RelationList widgets.
export interface RelationProps {
  // The `_id` of the collection to relate to.
  collection: string;

  // The field from the related collection to display in the selector.
  displayField: string;

  /**
   * Maximum number of items to select (if multiple is true).
   */
  max?: number;

  /**
   * Minimum number of items to select (if multiple is true).
   */
  min?: number;

  /**
   * Allow the user to select multiple entries.
   * @default false
   */
  multiple?: boolean;

  /**
   * Referential action executed when the referenced target entry is deleted.
   * - `restrict`: reject delete (409) when referenced
   * - `setNull`: clear/unlink the reference on referencing entries
   * - `cascade`: delete referencing entries recursively (capped fanout)
   */
  onDelete?: RelationOnDeleteAction;

  // Index signature to satisfy WidgetProps constraint
  [key: string]: unknown;
}

/**
 * Defines the properties unique to the RelationList widget.
 * It inherits from RelationProps and adds a `multiselect` option.
 */
export interface RelationListProps extends RelationProps {
  /**
   * Allow the user to select multiple entries.
   * @default true
   */
  multiselect?: boolean;
}
