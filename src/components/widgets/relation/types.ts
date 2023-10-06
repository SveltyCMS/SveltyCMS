import GuiField from './GuiField.svelte';

import Input from '@src/components/system/inputs/Input.svelte';
import Toggles from '@src/components/system/inputs/Toggles.svelte';

import type { Schema } from '@src/collections/types';
import { getFieldName } from '@src/utils/utils';

import mongoose from 'mongoose';

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

export const GraphqlSchema: GraphqlSchema = ({ field, label, collection }) => {
	return {
		typeName: field.relation.name,
		graphql: '', // relation does not need its own graphql because it copies related collection type
		resolver: {
			[collection.name]: {
				async [getFieldName(field)](parent) {
					console.log(getFieldName(field));
					const res = await mongoose.models[field.relation.name as string].findById(parent[getFieldName(field)]).lean();

					return res;
				}
			}
		}
	};
};
