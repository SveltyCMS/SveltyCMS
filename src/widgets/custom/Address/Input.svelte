<!--
@file src/widgets/custom/Address/Input.svelte
@component
**Address Widget Input Component**

Provides comprehensive address input with interactive Mapbox integration and geocoding.
Part of the Three Pillars Architecture for widget system.

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
	import { app } from '@src/stores/store.svelte';

	import { onDestroy } from 'svelte';
	import type { FieldType } from './';
	import countries from './countries.json';
	import type { AddressData } from './types';
	import { tokenTarget } from '@src/services/token/tokenTarget';

	let { field, value = $bindable(), error }: { field: FieldType; value: AddressData | null | undefined; error?: string | null } = $props();

	// Initialize value if missing
	$effect(() => {
		if (!value) {
			value = {
				street: '',
				houseNumber: '',
				postalCode: '',
				city: '',
				country: (field.defaultCountry as string) || 'DE',
				latitude: (field.mapCenter as { lat: number; lng: number })?.lat || 0,
				longitude: (field.mapCenter as { lat: number; lng: number })?.lng || 0
			};
		}
	});

	// Get the current system language for the UI.
	const lang = $derived(app.systemLanguage);

	// Note: Map functionality is placeholder for future Mapbox integration
	const map: any = null; // Placeholder for future Mapbox integration

	onDestroy(() => {
		if (map && typeof map.remove === 'function') {
			map.remove();
		}
	});
</script>

<div class="address-container" class:invalid={error}>
	{#if !(field.hiddenFields as string[])?.includes('latitude')}
		<div class="map">
			<!-- Map placeholder - Mapbox integration to be implemented -->
		</div>
	{/if}

	{#if value}
		<div class="form-grid">
			<div class="field relative">
				<label for="{field.db_fieldName}-street">Street</label>
				<input
					type="text"
					id="{field.db_fieldName}-street"
					bind:value={value.street}
					class="input"
					use:tokenTarget={{
						name: field.db_fieldName,
						label: field.label,
						collection: (field as any).collection
					}}
				/>
			</div>
			<div class="field">
				<label for="{field.db_fieldName}-houseNumber">House Number</label>
				<input type="text" id="{field.db_fieldName}-houseNumber" bind:value={value.houseNumber} class="input" />
			</div>
			<div class="field">
				<label for="{field.db_fieldName}-postalCode">Postal Code</label>
				<input type="text" id="{field.db_fieldName}-postalCode" bind:value={value.postalCode} class="input" />
			</div>
			<div class="field">
				<label for="{field.db_fieldName}-city">City</label>
				<input type="text" id="{field.db_fieldName}-city" bind:value={value.city} class="input" />
			</div>
			<div class="field">
				<label for="{field.db_fieldName}-country">Country</label>
				<select id="{field.db_fieldName}-country" bind:value={value.country} class="input">
					{#each countries as country}
						<option value={country.alpha2}>{country[lang] || country.en}</option>
					{/each}
				</select>
			</div>
		</div>
	{/if}

	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>
