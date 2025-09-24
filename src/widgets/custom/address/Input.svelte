<!--
@file src/widgets/custom/address/Input.svelte
@component
**Address Widget Input Component**

Provides comprehensive address input with interactive Mapbox integration and geocoding.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<AddressInput bind:value={addressData} field={fieldDefinition} />
Interactive form with map, country selector, and address validation

### Props
- `field: FieldType` - Widget field definition with map settings and configuration
- `value: AddressData | null | undefined` - Structured address object (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **Interactive Mapping**: Mapbox GL JS integration with draggable markers
- **Geocoding Support**: Address lookup and coordinate resolution
- **Country Selection**: Multilingual country dropdown with ISO codes
- **Field Visibility**: Configurable hidden fields for flexible layouts
- **Default Values**: Smart defaults from field configuration
- **Coordinate Tracking**: Automatic latitude/longitude capture
- **Responsive Design**: Grid-based form layout for optimal UX
- **Error Handling**: Accessible error display with ARIA attributes
- **Language Support**: Localized UI based on system language settings
-->

<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import type { FieldType, AddressData } from './';
	import countries from './countries.json';
	import type { Map as MapboxMap, Marker } from 'mapbox-gl';
	import { privateEnv } from '@src/stores/globalSettings';
	import { systemLanguage } from '@src/stores/store.svelte';

	let { field, value, error }: { field: FieldType; value: AddressData | null | undefined; error?: string | null } = $props();

	// Local reactive state for the form, initialized from the parent `value`.
	let address = $state<AddressData>(
		value ?? {
			street: '',
			houseNumber: '',
			postalCode: '',
			city: '',
			country: field.defaultCountry || 'DE',
			latitude: field.mapCenter?.lat || 0,
			longitude: field.mapCenter?.lng || 0
		}
	);

	// Get the current system language for the UI.
	const lang = $derived($systemLanguage);

	// Sync local `address` state back to the parent `value` when it changes.
	$effect(() => {
		value = address;
	});

	// State for the map UI
	let mapContainer: HTMLDivElement;
	let map: MapboxMap | null = null;
	let marker: Marker | null = null;
	const mapboxToken = privateEnv.MAPBOX_API_TOKEN;

	// (The rest of the <script> block with the map logic remains the same...)

	async function initializeMap() {
		// ... Mapbox initialization logic
	}
	onDestroy(() => {
		map?.remove();
	});
</script>

<div class="address-container" class:invalid={error}>
	{#if !field.hiddenFields?.includes('latitude')}
		<div bind:this={mapContainer} class="map"></div>
	{/if}

	<div class="form-grid">
		<div class="field">
			<label for="{field.db_fieldName}-street">Street</label>
			<input type="text" id="{field.db_fieldName}-street" bind:value={address.street} class="input" />
		</div>
		<div class="field">
			<label for="{field.db_fieldName}-country">Country</label>
			<select id="{field.db_fieldName}-country" bind:value={address.country} class="input">
				{#each countries as country}
					<option value={country.alpha2}>{country[lang] || country.en}</option>
				{/each}
			</select>
		</div>
	</div>

	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>
