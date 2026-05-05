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
- **Country Selection**: Multilingual country dropdown with ISO codes and SEARCH
- **Field Visibility**: Configurable hidden fields for flexible layouts
- **Default Values**: Smart defaults from field configuration
- **Coordinate Tracking**: Automatic latitude/longitude capture
- **Responsive Design**: Grid-based form layout for optimal UX
- **Error Handling**: Accessible error display with ARIA attributes
- **Language Support**: Localized UI based on system language settings
-->

<script lang="ts">
	import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	/* global google */
	import { app, validationStore } from '@src/stores/store.svelte';
	import { getFieldName } from '@utils/utils';
	import { handleWidgetValidation } from '@widgets/widget-error-handler';
	import { onMount } from 'svelte';
	import { minLength, object, optional, parse, pipe, string } from 'valibot';
	import type { FieldType } from './';
	import { countryStore } from './country-store.svelte';
	import type { AddressData } from './types';

	let {
		field,
		value = $bindable(),
		error
	}: {
		field: FieldType;
		value: Record<string, AddressData> | AddressData | null | undefined;
		error?: string | null;
	} = $props();

	// Feature Toggles from Props
	const showMap = $derived((field as any).defaults?.showMap ?? true);
	const enableGeocoding = $derived((field as any).defaults?.enableGeocoding ?? true);
	const showCoordinates = $derived((field as any).defaults?.showCoordinates ?? false);

	// Language Handling
	const DATA_LANGUAGE = $derived(field.translated ? app.contentLanguage : (publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en').toLowerCase());
	const UI_LANGUAGE = $derived(app.systemLanguage);

	let safeValue = $derived.by(() => {
		if (field.translated && value && typeof value === 'object') {
			return (value as Record<string, AddressData>)[DATA_LANGUAGE] as AddressData | undefined;
		}
		return value as AddressData | undefined;
	});

	function updateAddressField(key: keyof AddressData, newValue: any) {
		const currentAddress = safeValue || {
			street: '',
			houseNumber: '',
			postalCode: '',
			city: '',
			country: (field.defaultCountry as string) || 'DE',
			latitude: (field.mapCenter as { lat: number; lng: number })?.lat || 0,
			longitude: (field.mapCenter as { lat: number; lng: number })?.lng || 0
		};

		const updatedAddress = { ...currentAddress, [key]: newValue };

		if (field.translated) {
			value = { ...(typeof value === 'object' ? value : {}), [DATA_LANGUAGE]: updatedAddress } as Record<string, AddressData>;
		} else {
			value = updatedAddress;
		}
		validateAddress(updatedAddress);
	}

	function handleClear() {
		value = null;
		validationStore.clearError(fieldName);
	}

	// Validation
	const fieldName = $derived(getFieldName(field));
	const addressSchema = $derived(
		field?.required
			? object({
					street: pipe(string(), minLength(1, 'Street is required')),
					city: pipe(string(), minLength(1, 'City is required')),
					postalCode: pipe(string(), minLength(1, 'Postal code is required')),
					country: pipe(string(), minLength(2, 'Country is required'))
				})
			: optional(object({ street: string(), city: string(), postalCode: string(), country: string() }))
	);

	function validateAddress(addressData: AddressData | undefined) {
		if (!(addressData || field?.required)) {
			validationStore.clearError(fieldName);
			return;
		}
		handleWidgetValidation(() => parse(addressSchema, addressData), { fieldName, updateStore: true });
	}

	// Maps Integration
	let mapElement = $state<HTMLElement>();
	let searchInput = $state<HTMLInputElement>();
	let map = $state<google.maps.Map | null>(null);
	let marker = $state<google.maps.Marker | null>(null);
	let googleMapsApiKey = $derived(publicEnv.GOOGLE_MAPS_API_KEY as string);

	onMount(async () => {
		if (googleMapsApiKey && showMap) {
			await initMap();
		}
	});

	async function initMap() {
		setOptions({ key: googleMapsApiKey, v: 'weekly', libraries: ['places'] });
		try {
			const { Map } = (await importLibrary('maps')) as google.maps.MapsLibrary;
			const { Marker } = (await importLibrary('marker')) as google.maps.MarkerLibrary;
			const { Autocomplete } = (await importLibrary('places')) as google.maps.PlacesLibrary;

			if (mapElement) {
				const center = {
					lat: safeValue?.latitude || (field.mapCenter as any)?.lat || 51.1657,
					lng: safeValue?.longitude || (field.mapCenter as any)?.lng || 10.4515
				};

				map = new Map(mapElement, {
					center,
					zoom: safeValue?.latitude ? 15 : (field.zoom as number) || 6,
					mapTypeControl: false,
					streetViewControl: false
				});

				marker = new Marker({ position: center, map, draggable: true });
				marker.addListener('dragend', () => {
					const pos = marker?.getPosition();
					if (pos) {
						updateAddressField('latitude', pos.lat());
						updateAddressField('longitude', pos.lng());
					}
				});
			}

			if (searchInput && enableGeocoding) {
				const autocomplete = new Autocomplete(searchInput, {
					fields: ['address_components', 'geometry', 'formatted_address'],
					types: ['address']
				});

				autocomplete.addListener('place_changed', () => {
					const place = autocomplete.getPlace();
					if (place.geometry?.location) {
						fillInAddress(place);
						map?.setCenter(place.geometry.location);
						map?.setZoom(17);
						marker?.setPosition(place.geometry.location);
					}
				});
			}
		} catch (e) {
			console.error('Map init failed', e);
		}
	}

	function fillInAddress(place: google.maps.places.PlaceResult) {
		const components: any = {};
		for (const comp of place.address_components || []) {
			const type = comp.types[0];
			if (type === 'route') components.street = comp.long_name;
			if (type === 'street_number') components.houseNumber = comp.long_name;
			if (type === 'postal_code') components.postalCode = comp.long_name;
			if (type === 'locality') components.city = comp.long_name;
			if (type === 'country') components.country = comp.short_name;
		}
		Object.entries(components).forEach(([k, v]) => updateAddressField(k as any, v));
		if (place.geometry?.location) {
			updateAddressField('latitude', place.geometry.location.lat());
			updateAddressField('longitude', place.geometry.location.lng());
		}
	}
</script>

<div class="address-widget flex flex-col gap-4 rounded-xl border p-4 border-surface-300 dark:border-surface-600 bg-surface-50/30 dark:bg-surface-800/20">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2 font-bold text-surface-900 dark:text-surface-50">
			<iconify-icon icon="mdi:map-marker-radius" width="20"></iconify-icon>
			{field.label}
		</div>
		<button type="button" class="btn btn-sm variant-soft-surface gap-1" onclick={handleClear}>
			<iconify-icon icon="mdi:close-circle-outline" width="16"></iconify-icon>
			Clear
		</button>
	</div>

	{#if showMap}
		<div bind:this={mapElement} class="h-64 w-full rounded-lg border border-surface-300 bg-surface-100 dark:border-surface-700">
			{#if !googleMapsApiKey}
				<div class="flex h-full items-center justify-center text-xs text-surface-500">Google Maps API Key required for map</div>
			{/if}
		</div>
	{/if}

	<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
		<div class="md:col-span-3">
			<label class="label text-xs uppercase font-bold text-surface-500" for="street">Street / Search</label>
			<input 
				id="street"
				type="text" 
				bind:this={searchInput}
				class="input" 
				value={safeValue?.street || ''} 
				oninput={e => updateAddressField('street', e.currentTarget.value)}
				placeholder={enableGeocoding ? 'Search address...' : 'Street name'}
			/>
		</div>
		<div>
			<label class="label text-xs uppercase font-bold text-surface-500" for="hn">No.</label>
			<input id="hn" type="text" class="input" value={safeValue?.houseNumber || ''} oninput={e => updateAddressField('houseNumber', e.currentTarget.value)} />
		</div>
		
		<div class="md:col-span-1">
			<label class="label text-xs uppercase font-bold text-surface-500" for="pc">Postal Code</label>
			<input id="pc" type="text" class="input" value={safeValue?.postalCode || ''} oninput={e => updateAddressField('postalCode', e.currentTarget.value)} />
		</div>
		<div class="md:col-span-2">
			<label class="label text-xs uppercase font-bold text-surface-500" for="city">City</label>
			<input id="city" type="text" class="input" value={safeValue?.city || ''} oninput={e => updateAddressField('city', e.currentTarget.value)} />
		</div>
		<div class="md:col-span-1">
			<label class="label text-xs uppercase font-bold text-surface-500" for="country">Country</label>
			<select id="country" class="select" value={safeValue?.country || 'DE'} onchange={e => updateAddressField('country', e.currentTarget.value)}>
				{#each countryStore.countries as c}
					<option value={c.alpha2}>{countryStore.getCountryName(c.alpha2, UI_LANGUAGE)}</option>
				{/each}
			</select>
		</div>
	</div>

	{#if showCoordinates && safeValue?.latitude}
		<div class="flex items-center gap-4 p-2 bg-surface-100 dark:bg-surface-800 rounded text-xs font-mono">
			<div class="flex items-center gap-1"><span class="text-surface-400">Lat:</span> {safeValue.latitude.toFixed(6)}</div>
			<div class="flex items-center gap-1"><span class="text-surface-400">Lng:</span> {safeValue.longitude.toFixed(6)}</div>
		</div>
	{/if}

	{#if error}
		<p class="text-xs text-error-500 font-medium" role="alert">{error}</p>
	{/if}
</div>
