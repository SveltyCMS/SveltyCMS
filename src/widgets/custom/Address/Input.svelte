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
	import { tokenTarget } from '@src/services/token/tokenTarget';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	/* global google */
	import { app, validationStore } from '@src/stores/store.svelte';
	import { getFieldName } from '@utils/utils';
	// Unified error handling
	import { handleWidgetValidation } from '@widgets/widgetErrorHandler';
	import { onMount } from 'svelte';
	// Valibot validation
	import { minLength, object, optional, parse, pipe, string } from 'valibot';
	import type { FieldType } from './';
	import { countryStore } from './countryStore.svelte';
	import type { AddressData } from './types';

	// Define google namespace for TypeScript if not globally available
	/// <reference types="google.maps" />

	let {
		field,
		value = $bindable(),
		error
	}: { field: FieldType; value: Record<string, AddressData> | AddressData | null | undefined; error?: string | null } = $props();

	// --- 1. Language Handling (Architecture Compliance) ---

	// Data Language: Which language version of the address are we editing?
	// If field is translated, align with contentLanguage. Otherwise use default.
	const _dataLanguage = $derived(field.translated ? app.contentLanguage : (publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en').toLowerCase());

	// UI Language: Which language should the Country Dropdown LABELS be in?
	// Always use systemLanguage for UI elements.
	const _uiLanguage = $derived(app.systemLanguage);

	// Safe Value Access: Get the address object for the current data language
	let safeValue = $derived.by(() => {
		if (field.translated && value && typeof value === 'object') {
			// It's a multilingual object { en: {...}, de: {...} }
			return (value as Record<string, AddressData>)[_dataLanguage] as AddressData | undefined;
		}
		// It's a single address object
		return value as AddressData | undefined;
	});

	// Value Updater: Helper to update specific fields while preserving multilingual structure
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
			// Merge into multilingual object
			value = {
				...(typeof value === 'object' ? value : {}),
				[_dataLanguage]: updatedAddress
			} as Record<string, AddressData>;
		} else {
			// Direct update
			value = updatedAddress;
		}

		// Validate after update
		validateAddress(updatedAddress);
	}

	// Validation
	const fieldName = $derived(getFieldName(field));

	// Address validation schema
	const addressSchema = $derived(
		field?.required
			? object({
					street: pipe(string(), minLength(1, 'Street is required')),
					city: pipe(string(), minLength(1, 'City is required')),
					postalCode: pipe(string(), minLength(1, 'Postal code is required')),
					country: pipe(string(), minLength(2, 'Country is required'))
				})
			: optional(
					object({
						street: optional(string()),
						city: optional(string()),
						postalCode: optional(string()),
						country: optional(string())
					})
				)
	);

	function validateAddress(addressData: AddressData | undefined) {
		if (!(addressData || field?.required)) {
			validationStore.clearError(fieldName);
			return;
		}
		if (!addressData && field?.required) {
			validationStore.setError(fieldName, 'Address is required');
			return;
		}
		handleWidgetValidation(() => parse(addressSchema, addressData), { fieldName, updateStore: true });
	}

	// --- 2. Country Data & Search ---

	let countrySearch = $state('');

	// Reactive list of countries from store
	const countries = $derived(countryStore.countries);

	// Ensure full country list is loaded if UI language needs it
	$effect(() => {
		if (_uiLanguage) {
			countryStore.ensureLanguageLoaded(_uiLanguage);
		}
	});

	// Filtered countries for the dropdown
	const filteredCountries = $derived(
		countries.filter((c) => {
			if (!countrySearch) { return true; }
			const term = countrySearch.toLowerCase();
			const name = countryStore.getCountryName(c.alpha2, _uiLanguage).toLowerCase();
			return name.includes(term) || c.alpha2.toLowerCase().includes(term);
		})
	);

	// --- 3. Google Maps Integration ---

	let mapElement = $state<HTMLElement>();
	let searchInput = $state<HTMLInputElement>();
	let map = $state<google.maps.Map | null>(null);
	let marker = $state<google.maps.Marker | null>(null);
	let autocomplete = $state<google.maps.places.Autocomplete | null>(null);
	let googleMapsApiKey = $derived(publicEnv.GOOGLE_MAPS_API_KEY as string);

	onMount(async () => {
		// Initialize value if completely missing
		if (!value) {
			const initialAddress = {
				street: '',
				houseNumber: '',
				postalCode: '',
				city: '',
				country: (field.defaultCountry as string) || 'DE',
				latitude: (field.mapCenter as { lat: number; lng: number })?.lat || 0,
				longitude: (field.mapCenter as { lat: number; lng: number })?.lng || 0
			};

			if (field.translated) {
				value = { [_dataLanguage]: initialAddress };
			} else {
				value = initialAddress;
			}
		}

		if (googleMapsApiKey && !(field.hiddenFields as string[])?.includes('map')) {
			await initMap();
		}
	});

	async function initMap() {
		if (!googleMapsApiKey) {
			console.warn('Google Maps API Key is missing. Map functionality disabled.');
			return;
		}

		setOptions({
			key: googleMapsApiKey,
			v: 'weekly',
			libraries: ['places']
		});

		try {
			const { Map } = (await importLibrary('maps')) as google.maps.MapsLibrary;
			const { Marker } = (await importLibrary('marker')) as google.maps.MarkerLibrary;
			const { Autocomplete } = (await importLibrary('places')) as google.maps.PlacesLibrary;

			// Initialize Map
			if (mapElement) {
				const center = {
					lat: safeValue?.latitude || (field.mapCenter as any)?.lat || 51.1657,
					lng: safeValue?.longitude || (field.mapCenter as any)?.lng || 10.4515
				};

				map = new Map(mapElement, {
					center,
					zoom: safeValue?.latitude ? 15 : (field.zoom as number) || 6,
					mapTypeControl: false,
					streetViewControl: false,
					fullscreenControl: true
				});

				// Initialize Marker
				marker = new Marker({
					position: center,
					map,
					draggable: true,
					title: 'Location'
				});

				marker.addListener('dragend', () => {
					const pos = marker?.getPosition();
					if (pos) {
						updateAddressField('latitude', pos.lat());
						updateAddressField('longitude', pos.lng());
					}
				});

				// Locate Me Button
				const locationButton = document.createElement('button');
				locationButton.textContent = 'Locate Me';
				locationButton.classList.add('btn', 'variant-filled-primary', 'btn-sm', 'm-2', 'absolute', 'bottom-0', 'left-0');
				locationButton.type = 'button';

				locationButton.addEventListener('click', () => {
					if (navigator.geolocation) {
						navigator.geolocation.getCurrentPosition(
							(position) => {
								const pos = {
									lat: position.coords.latitude,
									lng: position.coords.longitude
								};
								map?.setCenter(pos);
								map?.setZoom(17);
								marker?.setPosition(pos);
								updateAddressField('latitude', pos.lat);
								updateAddressField('longitude', pos.lng);
							},
							() => {
								// handleLocationError(true, infoWindow, map.getCenter()!);
							}
						);
					}
				});
				map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(locationButton);
			}

			// Initialize Autocomplete
			if (searchInput) {
				autocomplete = new Autocomplete(searchInput, {
					fields: ['address_components', 'geometry', 'formatted_address'],
					types: ['address']
				});

				autocomplete.addListener('place_changed', () => {
					const place = autocomplete?.getPlace();
					if (!(place?.geometry?.location)) { return; }

					// Fill Form
					fillInAddress(place);

					// Update Map
					if (map && marker) {
						map.setCenter(place.geometry.location);
						map.setZoom(17);
						marker.setPosition(place.geometry.location);
					}
				});
			}
		} catch (e) {
			console.error('Google Maps Load Error:', e);
		}
	}

	function fillInAddress(place: google.maps.places.PlaceResult) {
		let street = '';
		let houseNumber = '';
		let postalCode = '';
		let city = '';
		let country = '';

		for (const component of place.address_components || []) {
			const type = component.types[0];
			switch (type) {
				case 'route':
					street = component.long_name;
					break;
				case 'street_number':
					houseNumber = component.long_name;
					break;
				case 'postal_code':
					postalCode = component.long_name;
					break;
				case 'locality':
					city = component.long_name;
					break;
				case 'country':
					country = component.short_name; // ISO 2 code
					break;
			}
		}

		updateAddressField('street', street);
		updateAddressField('houseNumber', houseNumber);
		updateAddressField('postalCode', postalCode);
		updateAddressField('city', city);
		updateAddressField('country', country);

		if (place.geometry?.location) {
			updateAddressField('latitude', place.geometry.location.lat());
			updateAddressField('longitude', place.geometry.location.lng());
		}
	}
</script>

<div class="address-container" class:invalid={error}>
	{#if !(field.hiddenFields as string[])?.includes('map')}
		<div
			class="map-container relative h-[300px] w-full rounded-md border border-surface-300 bg-surface-100 dark:border-surface-600 dark:bg-surface-800"
			bind:this={mapElement}
		>
			{#if !googleMapsApiKey}
				<div class="flex h-full flex-col items-center justify-center gap-2 text-surface-500">
					<iconify-icon icon="mdi:map-marker-off" width="32"></iconify-icon>
					<span class="text-sm">Map unavailable (API Key missing)</span>
				</div>
			{/if}
		</div>
	{/if}

	{#if safeValue}
		<div class="form-grid mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
			<!-- Street / Autocomplete -->
			<div class="field relative md:col-span-2">
				<label for="{field.db_fieldName}-street" class="label">Street / Search</label>
				<input
					type="text"
					id="{field.db_fieldName}-street"
					value={safeValue.street}
					oninput={(e) => updateAddressField('street', e.currentTarget.value)}
					class="input"
					bind:this={searchInput}
					placeholder="Search address or enter street"
					use:tokenTarget={{
						name: field.db_fieldName,
						label: field.label,
						collection: (field as any).collection
					}}
				>
			</div>

			<div class="field">
				<label for="{field.db_fieldName}-houseNumber">House Number</label>
				<input
					type="text"
					id="{field.db_fieldName}-houseNumber"
					value={safeValue.houseNumber}
					oninput={(e) => updateAddressField('houseNumber', e.currentTarget.value)}
					class="input"
				>
			</div>
			<div class="field">
				<label for="{field.db_fieldName}-postalCode">Postal Code</label>
				<input
					type="text"
					id="{field.db_fieldName}-postalCode"
					value={safeValue.postalCode}
					oninput={(e) => updateAddressField('postalCode', e.currentTarget.value)}
					class="input"
				>
			</div>
			<div class="field">
				<label for="{field.db_fieldName}-city">City</label>
				<input
					type="text"
					id="{field.db_fieldName}-city"
					value={safeValue.city}
					oninput={(e) => updateAddressField('city', e.currentTarget.value)}
					class="input"
				>
			</div>
			<div class="field">
				<label for="{field.db_fieldName}-country">Country</label>

				<!-- Country Search Filter -->
				<input type="text" bind:value={countrySearch} placeholder="Search countries..." class="input mb-2 text-sm">

				<select
					id="{field.db_fieldName}-country"
					value={safeValue.country}
					onchange={(e) => updateAddressField('country', e.currentTarget.value)}
					class="input"
				>
					<option value="" disabled>Select a country</option>
					{#each filteredCountries as country (country.alpha2)}
						<option value={country.alpha2}>{countryStore.getCountryName(country.alpha2, _uiLanguage)}</option>
					{/each}
				</select>
			</div>
		</div>
	{/if}

	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>
