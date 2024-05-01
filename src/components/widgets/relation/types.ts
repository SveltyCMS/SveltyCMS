import mongoose from 'mongoose';

// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@src/components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import Permission from '@src/components/Permission.svelte';

// Auth
import type { Permissions } from '@src/auth/types';
import GuiField from './GuiField.svelte';

import { getFieldName } from '@utils/utils';

/**
 * Defines Relation widget Parameters
 */
export type Params<K, T> = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	required?: boolean;
	// translated?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Permissions
	permissions?: Permissions;

	// Widget Specific parameters
	displayPath: any;
	relation: T;
};

/**
 * Defines Relation GuiSchema
 */
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	required: { widget: Toggles, required: false },
	// translated: { widget: Toggles, required: false },
	icon: { widget: IconifyPicker, required: false },
	helper: { widget: Input, required: false },
	width: { widget: Input, required: false },

	// Permissions
	permissions: { widget: Permission, required: false },

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
