<!--
@file src/widgets/custom/address/input.svelte
@component
**Address Widget Input Component**

Provides comprehensive address input with a dual-mode mapping system:
1. MapLibre GL JS + OpenFreeMap tiles + Photon (Komoot) search (default, 100% free)
2. Google Maps API Map + Autocomplete + Geocoding (activated when Google API key is configured)

Part of the Three Pillars Architecture for the widget system.

### Props
- `field: FieldType` - Widget field definition with map settings and configuration
- `value: AddressData | null | undefined` - Structured address object (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **Dual-Mode Mapping**: Fallback to MapLibre GL JS & OpenFreeMap if Google API key is absent.
- **Geocoding & Search**: Autocomplete via Photon API (default) or Google Places.
- **Draggable Marker**: Updates coordinates automatically; triggers reverse geocoding to auto-fill address inputs.
- **Coordinate Tracking**: Captures exact latitude/longitude.
- **Accessibility**: Full ARIA labels, semantic structure, and error feedback.
-->

<script lang="ts">
	import { browser } from '$app/environment';
		import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
		import Badge from '@components/ui/badge.svelte';
		import Button from '@components/ui/button.svelte';
		import FloatingInput from '@components/ui/floating-input.svelte';
		import Input from '@components/ui/input.svelte';
		import Select from '@components/ui/select.svelte';
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

	// Maps Elements and State
	let mapElement = $state<HTMLElement>();
	let map = $state<any>(null);
	let marker = $state<any>(null);
	let googleMapsApiKey = $derived(publicEnv.GOOGLE_MAPS_API_KEY as string);
	let activeMapType = $state<'google' | 'maplibre' | null>(null);

	// Search & Autocomplete State for Photon (MapLibre mode)
	let searchQuery = $state('');
	let suggestions = $state<Array<{ label: string; sublabel: string; data: any }>>([]);
	let showSuggestions = $state(false);
	let isLoadingSearch = $state(false);
	let searchTimeout: any;

	// Synchronize the search box text with the current street address
	$effect(() => {
		if (safeValue?.street) {
			const num = safeValue.houseNumber ? ` ${safeValue.houseNumber}` : '';
			searchQuery = `${safeValue.street}${num}`;
		} else {
			searchQuery = '';
		}
	});

	onMount(() => {
		if (!browser) return;

		// Mount appropriate map system asynchronously
		const initMap = async () => {
			if (googleMapsApiKey) {
				activeMapType = 'google';
				if (showMap) await initGoogleMap();
			} else {
				activeMapType = 'maplibre';
				if (showMap) await initMapLibre();
			}
		};
		initMap();

		// Close suggestions dropdown when clicking outside
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (!target.closest('.autocomplete-container')) {
				showSuggestions = false;
			}
		};
		document.addEventListener('click', handleClickOutside);

		return () => {
			document.removeEventListener('click', handleClickOutside);
			if (map) {
				if (activeMapType === 'maplibre') {
					map.remove();
				}
				map = null;
			}
		};
	});

	// --- 1. GOOGLE MAPS IMPLEMENTATION ---
	async function initGoogleMap() {
		setOptions({ key: googleMapsApiKey, v: 'weekly', libraries: ['places'] });
		try {
			const { Map } = (await importLibrary('maps')) as google.maps.MapsLibrary;
			const { Marker } = (await importLibrary('marker')) as google.maps.MarkerLibrary;
			const { Autocomplete } = (await importLibrary('places')) as google.maps.PlacesLibrary;
			const { Geocoder } = (await importLibrary('geocoding')) as google.maps.GeocodingLibrary;

			if (!mapElement) return;

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

			const geocoder = new Geocoder();
			marker.addListener('dragend', async () => {
				const pos = marker?.getPosition();
				if (pos) {
					const lat = pos.lat();
					const lng = pos.lng();
					updateAddressField('latitude', lat);
					updateAddressField('longitude', lng);

					try {
						const response = await geocoder.geocode({ location: { lat, lng } });
						if (response.results && response.results[0]) {
							fillInGoogleAddress(response.results[0]);
						}
					} catch (err) {
						console.error('Google reverse geocoding failed', err);
					}
				}
			});

			if (enableGeocoding) {
				const inputEl = document.getElementById('search-address') as HTMLInputElement;
				if (inputEl) {
					const autocomplete = new Autocomplete(inputEl, {
						fields: ['address_components', 'geometry', 'formatted_address'],
						types: ['address']
					});

					autocomplete.addListener('place_changed', () => {
						const place = autocomplete.getPlace();
						if (place.geometry?.location) {
							fillInGoogleAddress(place);
							map?.setCenter(place.geometry.location);
							map?.setZoom(17);
							marker?.setPosition(place.geometry.location);
						}
					});
				}
			}
		} catch (e) {
			console.error('Google Map init failed', e);
		}
	}

	function fillInGoogleAddress(place: google.maps.places.PlaceResult | google.maps.GeocoderResult) {
		const components: any = {
			street: '',
			houseNumber: '',
			postalCode: '',
			city: '',
			country: ''
		};

		for (const comp of place.address_components || []) {
			const type = comp.types[0];
			if (type === 'route') components.street = comp.long_name;
			if (type === 'street_number') components.houseNumber = comp.long_name;
			if (type === 'postal_code') components.postalCode = comp.long_name;
			if (type === 'locality') components.city = comp.long_name;
			if (type === 'country') components.country = comp.short_name.toUpperCase();
		}

		Object.entries(components).forEach(([k, v]) => {
			if (v) updateAddressField(k as any, v);
		});

		const loc = place.geometry?.location;
		if (loc) {
			updateAddressField('latitude', typeof loc.lat === 'function' ? loc.lat() : loc.lat);
			updateAddressField('longitude', typeof loc.lng === 'function' ? loc.lng() : loc.lng);
		}
	}

	// --- 2. MAPLIBRE & PHOTON IMPLEMENTATION ---
	async function initMapLibre() {
		try {
			if (!mapElement) return;

			const maplibregl = (await import('maplibre-gl')).default;

			// Add MapLibre styles dynamically to head if not present
			if (!document.getElementById('maplibre-style')) {
				const link = document.createElement('link');
				link.id = 'maplibre-style';
				link.rel = 'stylesheet';
				link.href = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css';
				document.head.appendChild(link);
			}

			const center: [number, number] = [
				safeValue?.longitude || (field.mapCenter as any)?.lng || 10.4515,
				safeValue?.latitude || (field.mapCenter as any)?.lat || 51.1657
			];

			map = new maplibregl.Map({
				container: mapElement,
				style: 'https://tiles.openfreemap.org/styles/bright/style.json',
				center,
				zoom: safeValue?.latitude ? 15 : (field.zoom as number) || 6
			});

			map.addControl(new maplibregl.NavigationControl(), 'top-right');

			marker = new maplibregl.Marker({ draggable: true })
				.setLngLat(center)
				.addTo(map);

			marker.on('dragend', async () => {
				const lngLat = marker.getLngLat();
				updateAddressField('latitude', lngLat.lat);
				updateAddressField('longitude', lngLat.lng);
				await reverseGeocodePhoton(lngLat.lat, lngLat.lng);
			});
		} catch (e) {
			console.error('MapLibre init failed', e);
		}
	}

	function handleSearchQuery(query: string) {
		searchQuery = query;

		if (searchTimeout) clearTimeout(searchTimeout);

		if (!query.trim()) {
			suggestions = [];
			showSuggestions = false;
			return;
		}

		searchTimeout = setTimeout(async () => {
			isLoadingSearch = true;
			try {
				const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
				const data = await res.json();
				if (data && data.features) {
					suggestions = data.features.map((f: any) => {
						const p = f.properties;

						const parts = [];
						if (p.name) parts.push(p.name);
						if (p.street) {
							if (p.housenumber) parts.push(`${p.street} ${p.housenumber}`);
							else parts.push(p.street);
						}
						const label = parts.length > 0 ? parts.join(', ') : (p.city || p.country || 'Location');

						const subparts = [];
						if (p.postcode) subparts.push(p.postcode);
						if (p.city) subparts.push(p.city);
						if (p.country) subparts.push(p.country);
						const sublabel = subparts.join(' ') || '';

						return { label, sublabel, data: f };
					});
					showSuggestions = true;
				}
			} catch (err) {
				console.error('Photon autocomplete failed', err);
			} finally {
				isLoadingSearch = false;
			}
		}, 350);
	}

	function selectSuggestion(suggestion: any) {
		const feature = suggestion.data;
		const p = feature.properties;
		const coords = feature.geometry.coordinates; // [lng, lat]

		const updatedFields = {
			street: p.street || p.name || '',
			houseNumber: p.housenumber || '',
			postalCode: p.postcode || '',
			city: p.city || p.town || p.village || '',
			country: (p.countrycode || 'DE').toUpperCase(),
			latitude: coords[1],
			longitude: coords[0]
		};

		Object.entries(updatedFields).forEach(([k, v]) => {
			updateAddressField(k as any, v);
		});

		if (map && marker) {
			if (activeMapType === 'google') {
				const googleCoords = { lat: coords[1], lng: coords[0] };
				map.setCenter(googleCoords);
				map.setZoom(17);
				marker.setPosition(googleCoords);
			} else {
				map.flyTo({ center: coords, zoom: 16 });
				marker.setLngLat(coords);
			}
		}

		searchQuery = suggestion.label;
		showSuggestions = false;
	}

	async function reverseGeocodePhoton(lat: number, lng: number) {
		try {
			const res = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`);
			const data = await res.json();
			if (data && data.features && data.features.length > 0) {
				const p = data.features[0].properties;

				const updatedFields = {
					street: p.street || p.name || '',
					houseNumber: p.housenumber || '',
					postalCode: p.postcode || '',
					city: p.city || p.town || p.village || '',
					country: (p.countrycode || 'DE').toUpperCase(),
					latitude: lat,
					longitude: lng
				};

				Object.entries(updatedFields).forEach(([k, v]) => {
					updateAddressField(k as any, v);
				});

				const parts = [];
				if (p.street) {
					if (p.housenumber) parts.push(`${p.street} ${p.housenumber}`);
					else parts.push(p.street);
				} else if (p.name) {
					parts.push(p.name);
				}
				if (p.city) parts.push(p.city);
				searchQuery = parts.join(', ');
			}
		} catch (err) {
			console.error('Photon reverse geocoding failed', err);
		}
	}

	function handleClear() {
		value = null;
		searchQuery = '';
		validationStore.clearError(fieldName);

		const defaultCenter = {
			lat: (field.mapCenter as any)?.lat || 51.1657,
			lng: (field.mapCenter as any)?.lng || 10.4515
		};
		if (map && marker) {
			if (activeMapType === 'google') {
				map.setCenter(defaultCenter);
				map.setZoom((field.zoom as number) || 6);
				marker.setPosition(defaultCenter);
			} else if (activeMapType === 'maplibre') {
				map.flyTo({ center: [defaultCenter.lng, defaultCenter.lat], zoom: (field.zoom as number) || 6 });
				marker.setLngLat([defaultCenter.lng, defaultCenter.lat]);
			}
		}
	}
</script>

<div class="address-widget flex flex-col gap-4 rounded border p-4 border-surface-300 dark:border-surface-600 bg-surface-50/30 dark:bg-surface-800/20">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2 font-bold text-surface-900 dark:text-surface-50">
			<iconify-icon icon="mdi:map-marker-radius" width="20"></iconify-icon>
			{field.label}
		</div>
		<Button variant="surface" size="sm" type="button" onclick={handleClear}>
			<iconify-icon icon="mdi:close-circle-outline" width="16"></iconify-icon>
			Clear
		</Button>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
		<!-- Left: Form Fields -->
		<div class="lg:col-span-7 flex flex-col gap-4">
			{#if enableGeocoding}
				<div class="relative autocomplete-container">
					<div class="relative">
						<FloatingInput
							id="search-address"
							bind:value={searchQuery}
							label="Address Search"
							icon="mdi:map-search"
							onInput={googleMapsApiKey ? undefined : handleSearchQuery}
							onClick={googleMapsApiKey ? undefined : () => (showSuggestions = true)}
							inputClass="pe-10"
						/>
						{#if isLoadingSearch}
							<div class="pointer-events-none absolute inset-e-3 top-1/2 -translate-y-1/2">
								<iconify-icon icon="line-md:loading-loop" width="18"></iconify-icon>
							</div>
						{/if}
					</div>

					{#if !googleMapsApiKey && showSuggestions && suggestions.length > 0}
						<div class="absolute z-50 inset-s-0 inset-e-0 mt-1 max-h-60 overflow-y-auto rounded border border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-800 shadow-xl">
							<ul class="list-none p-0 m-0">
								{#each suggestions as sug}
									<li>
										<button
											type="button"
											class="w-full text-start px-4 py-2 text-sm hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors flex flex-col gap-0.5 border-b border-surface-200/50 dark:border-surface-700/50"
											onclick={() => selectSuggestion(sug)}
										>
											<span class="font-medium text-surface-900 dark:text-surface-50">{sug.label}</span>
											<span class="text-xs text-surface-500 dark:text-surface-400">{sug.sublabel}</span>
										</button>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			{/if}

			<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
				<div class="md:col-span-3">
					<Input
						id="street"
						label="Street"
						labelClass="text-xs uppercase font-bold text-surface-500"
						value={safeValue?.street || ''}
						oninput={(e) => updateAddressField('street', e.currentTarget.value)}
						placeholder="Street name"
					/>
				</div>
				<div>
					<Input
						id="hn"
						label="No."
						labelClass="text-xs uppercase font-bold text-surface-500"
						value={safeValue?.houseNumber || ''}
						oninput={(e) => updateAddressField('houseNumber', e.currentTarget.value)}
						placeholder="123"
					/>
				</div>

				<div class="md:col-span-1">
					<Input
						id="pc"
						label="Postal Code"
						labelClass="text-xs uppercase font-bold text-surface-500"
						value={safeValue?.postalCode || ''}
						oninput={(e) => updateAddressField('postalCode', e.currentTarget.value)}
						placeholder="12345"
					/>
				</div>
				<div class="md:col-span-2">
					<Input
						id="city"
						label="City"
						labelClass="text-xs uppercase font-bold text-surface-500"
						value={safeValue?.city || ''}
						oninput={(e) => updateAddressField('city', e.currentTarget.value)}
						placeholder="Berlin"
					/>
				</div>
				<div class="md:col-span-1">
					<Select
						label="Country"
						value={safeValue?.country || 'DE'}
						allowEmptySelection
						options={countryStore.countries.map((c) => ({
							value: c.alpha2,
							label: countryStore.getCountryName(c.alpha2, UI_LANGUAGE)
						}))}
						onchange={(val) => updateAddressField('country', val)}
					/>
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

		<!-- Right: Map Container -->
		{#if showMap}
			<div class="lg:col-span-5 flex flex-col gap-2">
				<div class="label text-xs uppercase font-bold text-surface-500 flex items-center justify-between">
					<span>Interactive Map</span>
					<Badge preset="tonal" color="primary" size="sm" class="uppercase font-mono tracking-wider">
						{googleMapsApiKey ? 'Google Maps' : 'MapLibre Free'}
					</Badge>
				</div>
				<div bind:this={mapElement} class="h-80 lg:h-full min-h-75 w-full rounded border border-surface-300 bg-surface-100 dark:border-surface-700 relative overflow-hidden">
				</div>
			</div>
		{/if}
	</div>
</div>
