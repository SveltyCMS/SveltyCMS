// Components
import Input from '@components/system/inputs/Input2.svelte';
import GuiField from './GuiField.svelte';
import Permissions from '@src/components/Permissions.svelte';
import type { permissions } from '@src/collections/types';
import type { CollectionLabels } from '@src/collections/types';

import { getFieldName } from '@utils/utils';

import mongoose from 'mongoose';

/**
 * Defines Relation widget Parameters
 */
export type Params = {
	displayPath: any;
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	translated?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Permissions
	permissions?: permissions;

	// Widget Specific parameters
	relation: CollectionLabels;
};

/**
 * Defines Relation GuiSchema
 */
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	width: { widget: Input, required: false },

	// Permissions
	permissions: { widget: Permissions, required: false },

	// Widget Specific parameters
	relation: {
		widget: GuiField,
		required: true,
		imports: ['import {relation} from "./{relation}"']
	}
};

/**
 * Define Relation GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = ({ field, collection }) => {
	// Return an object containing the type name and the GraphQL schema
	return {
		typeName: field.relation,
		graphql: '', // relation does not need its own graphql because it copies related collection type
		resolver: {
			[collection.name]: {
				async [getFieldName(field)](parent: any) {
					// console.log(getFieldName(field));
					const res = await mongoose.models[field.relation].findById(parent[getFieldName(field)]).lean();

					return res;
				}
			}
		}
	};
};
