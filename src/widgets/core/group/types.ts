/**
@file src/widgets/core/group/types.ts
@description - Group widget types
*/

// Types
import type { Field, CollectionData, ContentEntry } from '@src/content/types';
import type { WidgetFunction } from '@widgets/types';

type DisplayParams = {
	data: ContentEntry;
	contentLanguage: string;
};

export type DISPLAY = (params: DisplayParams) => Promise<string>;

/**
 * Defines Group widget Parameters
 */
export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: WidgetFunction;
	required?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Widget Specific parameters
	fields: Field[];
	mode: 'tab' | 'group';
};

/**
 * Defines Group GuiSchema
 */
export type GuiSchema = object; // Type for GUI configuration object

/**
 * Define Group GraphqlSchema function
 */
import type { CollectionData } from '@src/content/types';

export const GraphqlSchema = function ({ label, collection }: { label: string; collection: CollectionData }) {
	const typeName = `${collection.name}_${label}`;
	return { typeName, graphql: '' };
};

/**
 * Export FieldType for use in the Group widget
 */
export type FieldType = ReturnType<typeof widget>;
