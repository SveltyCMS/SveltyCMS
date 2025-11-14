/**
 * @file src/widgets/custom/address/index.ts
 * @description Address Widget Definition.
 *
 * A comprehensive widget for capturing and displaying structured address data,
 * optionally integrated with an interactive map for geocoding.
 *
 * @features
 * - **Structured Data**: Stores a complete, well-defined address object.
 * - **Configurable GUI**: `GuiSchema` provides a UI for setting widget-specific props.
 * - **Geocoding Support**: Integrates with Mapbox for visual location picking.
 * - **Valibot Schema**: Ensures all parts of the address are correctly formatted.
 */

// Import components needed for the GuiSchema
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

import { createWidget } from '@src/widgets/factory';
import { object, string, number, minLength, pipe, type InferInput as ValibotInput } from 'valibot';
import type { AddressProps } from './types';
import * as m from '@src/paraglide/messages';

// Define the validation schema for the address data object.
const AddressValidationSchema = object({
	street: pipe(string(), minLength(1, 'Street is required.')),
	houseNumber: string(),
	postalCode: pipe(string(), minLength(1, 'Postal code is required.')),
	city: pipe(string(), minLength(1, 'City is required.')),
	country: pipe(string(), minLength(2, 'Country is required.')),
	latitude: number(),
	longitude: number()
});

// Create the widget definition using the factory.
const AddressWidget = createWidget<AddressProps>({
	Name: 'Address',
	Icon: 'mdi:home-map-marker',
	Description: m.widget_address_description(),
	inputComponentPath: '/src/widgets/custom/address/Input.svelte',
	displayComponentPath: '/src/widgets/custom/address/Display.svelte',
	validationSchema: AddressValidationSchema,

	// Define the UI for configuring this widget's properties in the Collection Builder.
	GuiSchema: {
		// Standard fields
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		width: { widget: Input, required: false },

		// Widget-specific fields from AddressProps
		defaultCountry: {
			widget: Input,
			required: false,
			helper: "Default 2-letter country code (e.g., 'DE', 'US')."
		},
		mapCenter: {
			widget: Input,
			required: false,
			helper: "Default map center (e.g., '51.34,6.57')."
		},
		zoom: { widget: Input, required: false, helper: 'Default map zoom level (e.g., 12).' },
		hiddenFields: {
			widget: Input,
			required: false,
			helper: "Comma-separated list of fields to hide (e.g., 'latitude,longitude')."
		}
	},

	// Set widget-specific defaults.
	defaults: {
		mapCenter: { lat: 51.34, lng: 6.57 },
		zoom: 12,
		defaultCountry: 'DE',
		hiddenFields: [],
		translated: false
	}
});

export default AddressWidget;

// Export helper types.
export type FieldType = ReturnType<typeof AddressWidget>;
export type AddressWidgetData = ValibotInput<typeof AddressValidationSchema>;
