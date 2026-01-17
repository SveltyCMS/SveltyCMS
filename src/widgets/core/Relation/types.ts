/**
 * @file src/widgets/core/Relation/types.ts
 * @description Type definitions for the Relation and RelationList widgets.
 *
 * @features
 * - **Strongly Typed**: Defines clear configuration options for relationships.
 * - **Modular**: Separates props for single and multiple relation types.
 */

// Defines the properties unique to the Relation & RelationList widgets.
export interface RelationProps {
	// The `_id` of the collection to relate to.
	collection: string;

	// The field from the related collection to display in the selector.
	displayField: string;

	// Population depth for relationships (0-10). 0 = ID only, higher values populate nested relations.
	populationDepth?: number;

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
