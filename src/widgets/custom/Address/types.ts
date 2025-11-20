/**
 * @file src/widgets/custom/Address/types.ts
 * @description Type definitions for the Address widget.
 *
 * @features
 * - **Strongly Typed**: Defines clear configuration options and the address data structure.
 * - **Configurable UI**: Allows hiding specific fields for different use cases.
 */

// Defines the properties unique to the Address widget, configured in the collection builder.
export interface AddressProps {
	// The default country to select in the dropdown @default 'DE'
	defaultCountry?: string; // Should be a 2-letter country code like 'DE' or 'US'

	// Default map center coordinates
	mapCenter?: { lat: number; lng: number };

	// Default map zoom level @default 12
	zoom?: number;

	// An array of field names to hide from the UI e.g., ['latitude', 'longitude', 'name']
	hiddenFields?: Array<keyof AddressData>;

	// Index signature to satisfy WidgetProps constraint
	[key: string]: unknown;
}

// Defines the data structure for a complete address object
export interface AddressData {
	street: string;
	houseNumber: string;
	postalCode: string;
	city: string;
	country: string; // Stored as a 2-letter country code
	latitude: number;
	longitude: number;
}
