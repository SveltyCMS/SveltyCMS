import GuiField from './GuiField.svelte';

import Input from '@src/components/system/inputs/Input2.svelte';
// import Toggles from '@src/components/system/inputs/Toggles.svelte';
// import { contentLanguage } from '@src/stores/store';

import type { Schema } from '@src/collections/types';
import { getFieldName } from '@src/utils/utils';

import mongoose from 'mongoose';

// Define the widget Parameters
export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	translated?: boolean;
	icon?: string;

	// Widget Specific parameters
	relation: Schema;
};

// Define the GuiSchema
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	// Widget Specific parameters
	relation: {
		widget: GuiField,
		required: true,
		imports: ['import {relation} from "./{relation}"']
	}
};

// Define the GraphqlSchema function
export const GraphqlSchema: GraphqlSchema = ({ field, label, collection }) => {

	// Return an object containing the type name and the GraphQL schema
	return {
		typeName: field.relation.name,
		graphql: '', // relation does not need its own graphql because it copies related collection type
		resolver: {
			[collection.name]: {
				async [getFieldName(field)](parent:any) {
					console.log(getFieldName(field));
					const res = await mongoose.models[field.relation.name as string].findById(parent[getFieldName(field)]).lean();

					return res;
				}
			}
		}
	};
};
