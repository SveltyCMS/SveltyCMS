import Input from '@src/components/system/inputs/Input2.svelte';
import Toggles from '@src/components/system/inputs/Toggles.svelte';
import { contentLanguage } from '@src/stores/store';

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
	color?: string;
	required?: boolean;
	width?: string;
};

// Define the GuiSchema
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	// widget?: any;
	translated: { widget: Toggles, required: false },
	icon: { widget: Input, required: false },

	// Widget Specific parameters
	color: { widget: Input, required: false },
	required: { widget: Toggles, required: false },
	width: { widget: Input, required: false }
};

// Define the GraphqlSchema function
export const GraphqlSchema: GraphqlSchema = ({ label, collection }) => {
	// Create a type name by combining the collection name and label
    const typeName = `${collection.name}_${label}`;
	 // Initialize an empty string to hold the fields
    let fields = '';
	// Iterate over each language 
    for (const lang in contentLanguage) {
        fields += `${lang}: String\n`;
    }

	// Return an object containing the type name and the GraphQL schema
    return {
        typeName,
        graphql: /* GraphQL */ `
        type ${typeName} {
            ${fields}
        }
        `
    };
};