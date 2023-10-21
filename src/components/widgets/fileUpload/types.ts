import Input from '@src/components/system/inputs/Input2.svelte';
import Toggles from '@src/components/system/inputs/Toggles.svelte';
import { SIZES } from '@src/utils/utils';

export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	translated?: boolean;
	icon?: string;

	// Widget Specific parameters
	path: (string & {}) | 'global' | 'unique';
	required?: boolean;
};

export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	// widget?: any;
	//translated: { widget: Toggles, required: false },
	icon: { widget: Input, required: false },

	// Widget Specific parameters
	path: { widget: Input, required: false },
	required: { widget: Toggles, required: false }
};

const types = Object.keys(SIZES)
	.map(
		(size) =>
			`type ${size} {
	name: String
	url: String
	size: Int
	type: String
	lastModified: Float
}`
	)
	.join('\n');

export const GraphqlSchema: GraphqlSchema = ({ field, label, collection }) => {
	const typeName = `${collection.name}_${label}`;
	console.log(typeName);
	return {
		typeName,
		graphql: /* GraphQL */ `
		${types}
		type ${typeName} {
			${Object.keys(SIZES)
				.map((size) => `${size}: ${size}`)
				.join('\n')}
		}
	`
	};
};
