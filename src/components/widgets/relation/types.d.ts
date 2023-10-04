import type { Schema } from '@src/collections/types';

import GuiField from './GuiField.svelte';

export type Params = {
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	// Widget Specific parameters
	widget?: any;
	relation: Schema;
};

export const GuiSchema = {
	label: { widget: FloatingInput, required: true },
	display: { widget: FloatingInput, required: true },
	db_fieldName: { widget: FloatingInput, required: true },
	// Widget Specific parameters
	relation: {
		widget: GuiField,
		required: true,
		imports: ['import {relation} from "./{relation}"']
	}
};

export const GraphqlSchema = ({ label }) => {
	return /* GraphQL */ `
		type ${label.replace(/ /g, '_')} {
			en: String
		}
	`;
};
