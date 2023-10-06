import Input from '@src/components/system/inputs/Input2.svelte';
import Toggles from '@src/components/system/inputs/Toggles.svelte';

export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	translated?: boolean;
	icon?: string;

	// Widget Specific parameters
	placeholder?: string;
	required?: boolean;
	width?: string;
};

export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	// widget?: any;
	icon: { widget: Input, required: false },

	// Widget Specific parameters
	placeholder: { widget: Input, required: false },
	required: { widget: Toggles, required: false },
	width: { widget: Input, required: false }
};

export const GraphqlSchema: GraphqlSchema = ({ label, collection }) => {
	const typeName = `${collection.name}_${label}`;
	return {
		typeName,
		graphql: /* GraphQL */ `
		type ${typeName} {
			en: String
		}
	`
	};
};
