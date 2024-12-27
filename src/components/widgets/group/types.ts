/**
@file src/components/widgets/group/types.ts
@description - Group widget types
*/

// Components
import type { CollectionFields } from '@src/content/types';

/**
 * Defines Group widget Parameters
 */
export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	required?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Widget Specific parameters
	fields: CollectionFields;
	mode: 'tab' | 'group';
};

/**
 * Defines Group GuiSchema
 */
export type GuiSchema = object; // Type for GUI configuration object

/**
 * Define Group GraphqlSchema function
 */
export const GraphqlSchema = function ({ label, collection }: { label: string; collection: any }) {
	const typeName = `${collection.name}_${label}`;
	return { typeName, graphql: '' };
};