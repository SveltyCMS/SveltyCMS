<!-- 
@file src/widgets/custom/address/Address.svelte
@component
**Address widget**

@example
<Address label="Address" db_fieldName="address" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { privateEnv } from '@root/config/private';

	// Stores
	import { validationStore } from '@stores/store.svelte';
	import { type Field } from '@src/content/types';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Import Mapbox CSS at the top level
	import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
	import 'mapbox-gl/dist/mapbox-gl.css';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem, Autocomplete } from '@skeletonlabs/skeleton';

	// Valibot validation
	import * as v from 'valibot';

	// Countries data and types
	import countries from './countries.json';
	import type { AddressData, Country } from './types';

	import type { Map as MapboxMap, Marker } from 'mapbox-gl';

	// Initialize Mapbox
	const mapboxToken = privateEnv.MAPBOX_API_TOKEN;
	const isMapboxEnabled = privateEnv.USE_MAPBOX && mapboxToken;

	interface Props {
		field?: Field;
		value?: AddressData;
		mapCenter: { lat: number; lng: number };
		zoom: number;
		defaultCountry: string;
		hiddenFields: Array<string>;
	}

	const defaultAddress: AddressData = {
		latitude: '0',
		longitude: '0',
		name: '',
		street: '',
		houseNumber: '',
		postalCode: '',
		city: '',
		country: ''
	};

	let {
		field,
		value = defaultAddress,
		mapCenter = { lat: 51.34, lng: 6.57 },
		zoom = 12,
		defaultCountry = 'Germany',
		hiddenFields = []
	}: Props = $props();

	const fieldName = getFieldName(field);

	// State variables
	let validationError = $state<string | null>(null);
	let debounceTimeout: number | undefined;
	let listboxValue = $state(defaultCountry);
	let searchQuery = $state('');
	let filteredCountries = $state<Country[]>((countries as Country[]) || []);
	let map = $state<MapboxMap | null>(null);
	let mapContainer = $state<HTMLDivElement | undefined>();
	let marker = $state<Marker | null>(null);

	$effect(() => {
		if (!searchQuery) {
			filteredCountries = (countries as Country[]) || [];
			return;
		}
		const query = searchQuery.toLowerCase();
		filteredCountries = ((countries as Country[]) || []).filter(
			(country) => country && country.en && (country.en.toLowerCase().includes(query) || String(country.id).toLowerCase().includes(query))
		);
	});

	$effect(() => {
		if (!value) {
			value = { ...defaultAddress };
		}
	});

	// Effect to initialize map when container becomes available
	$effect(() => {
		if (mapContainer && !hiddenFields.includes('map') && !map) {
			initMap();
		}
	});

	const CountryCombobox: PopupSettings = {
		event: 'click',
		target: 'CountryCombobox',
		placement: 'bottom',
		closeQuery: '.listbox-item'
	};

	function validateInput() {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			try {
				// Convert string values to numbers for validation
				const numericValue = {
					...value,
					latitude: parseFloat(String(value.latitude)) || 0,
					longitude: parseFloat(String(value.longitude)) || 0
				};
				v.parse(addressSchema, numericValue);
				validationError = null;
				validationStore.clearError(fieldName);
			} catch (error) {
				if (error instanceof v.ValiError) {
					validationError = error.issues[0].message;
					validationStore.setError(fieldName, validationError);
				}
			}
		}, 300);
	}

	function searchCountry(event: Event) {
		searchQuery = (event.target as HTMLInputElement).value;
	}

	async function initMap() {
		if (!isMapboxEnabled || !browser || !mapContainer) return;

		try {
			// Vite 7 compatible dynamic imports
			const [mapboxModule, geocoderModule, languageModule] = await Promise.all([
				import('mapbox-gl'),
				import('@mapbox/mapbox-gl-geocoder'),
				import('@mapbox/mapbox-gl-language')
			]);

			// Handle different export patterns for Vite 7
			const mapboxgl = 'default' in mapboxModule ? mapboxModule.default : mapboxModule;
			const MapboxGeocoder = 'default' in geocoderModule ? geocoderModule.default : geocoderModule;
			const MapboxLanguage = 'default' in languageModule ? languageModule.default : languageModule;

			// Set access token
			if (mapboxToken && 'accessToken' in mapboxgl) {
				(mapboxgl as any).accessToken = mapboxToken;
			}

			map = new (mapboxgl as any).Map({
				container: mapContainer,
				style: 'mapbox://styles/mapbox/streets-v12',
				center: [mapCenter.lng, mapCenter.lat],
				zoom: zoom
			});

			if (!map) return;

			const language = new (MapboxLanguage as any)();
			map.addControl(language);

			const geocoder = new (MapboxGeocoder as any)({
				accessToken: String(mapboxToken ?? ''),
				mapboxgl: mapboxgl
			});
			map.addControl(geocoder);

			map.on('load', () => {
				if (map) {
					map.resize();
				}
			});

			marker = new (mapboxgl as any).Marker({ draggable: true }).setLngLat([mapCenter.lng, mapCenter.lat]).addTo(map);

			if (marker) {
				marker.on('dragend', (e: any) => {
					const lngLat = e.target.getLngLat();
					if (value) {
						value.latitude = lngLat.lat.toString();
						value.longitude = lngLat.lng.toString();
					}
				});
			}

			map.addControl(new (mapboxgl as any).NavigationControl());
			map.addControl(new (mapboxgl as any).FullscreenControl());
		} catch (error) {
			console.error('Failed to load Mapbox:', error);
		}
	}

	onMount(() => {
		listboxValue = defaultCountry;
	});

	onDestroy(() => {
		if (map) {
			map.remove();
			map = null;
		}
		if (marker) {
			marker.remove();
			marker = null;
		}
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}
	});

	// Validation schema
	const addressSchema = v.object({
		latitude: v.number(),
		longitude: v.number(),
		name: v.string(),
		street: v.string(),
		houseNumber: v.string(),
		postalCode: v.string(),
		city: v.string(),
		country: v.string()
	});

	export const WidgetData = async () => value;
</script>

<div class="input-container relative mb-4">
	{#if isMapboxEnabled}
		<div id="map" bind:this={mapContainer} class="h-64 w-full"></div>

		<address class="w-full" class:error={!!validationError}>
			<div class="mb-1 mt-4 flex justify-between gap-2">
				<button aria-label={m.widget_address_getfromaddress()} class="variant-filled-primary btn btn-base rounded-md text-white">
					<iconify-icon icon="bi:map" width="16" class="mr-2"></iconify-icon>
					{m.widget_address_getfromaddress()}
				</button>
			</div>

			<label for="latitude">{m.widget_address_geocoordinates()}</label>
			<div class="flex justify-center gap-2">
				<input
					required
					type="text"
					id="latitude"
					name="latitude"
					placeholder={m.widget_address_latitude()}
					bind:value={value.latitude}
					oninput={validateInput}
					aria-label={m.widget_address_latitude()}
					aria-invalid={!!validationError}
					aria-describedby={validationError ? `${fieldName}-error` : undefined}
					class="input rounded-md"
				/>

				<input
					required
					type="text"
					id="longitude"
					name="longitude"
					placeholder={m.widget_address_longitude()}
					bind:value={value.longitude}
					oninput={validateInput}
					aria-label={m.widget_address_longitude()}
					aria-invalid={!!validationError}
					aria-describedby={validationError ? `${fieldName}-error` : undefined}
					class="input rounded-md"
				/>
			</div>
			<br />

			<form>
				<label for="name">{m.widget_address_name()}</label>
				<input
					required
					type="text"
					id="name"
					name="name"
					autocomplete="name"
					placeholder={m.widget_address_name()}
					class="input rounded-md"
					bind:value={value.name}
					oninput={validateInput}
					aria-label={m.widget_address_name()}
					aria-invalid={!!validationError}
					aria-describedby={validationError ? `${fieldName}-error` : undefined}
				/>

				<label for="street-address">{m.widget_address_street()}</label>
				<input
					type="text"
					id="street-address"
					name="street-address"
					autocomplete="street-address"
					placeholder={m.widget_address_street()}
					required
					enterkeyhint="next"
					class="input rounded-md"
					bind:value={value.street}
					oninput={validateInput}
					aria-label={m.widget_address_street()}
					aria-invalid={!!validationError}
					aria-describedby={validationError ? `${fieldName}-error` : undefined}
				/>

				<label for="house-number">House Number</label>
				<input
					type="text"
					id="house-number"
					name="house-number"
					placeholder="House Number"
					class="input rounded-md"
					bind:value={value.houseNumber}
					oninput={validateInput}
					aria-label="House Number"
					aria-invalid={!!validationError}
					aria-describedby={validationError ? `${fieldName}-error` : undefined}
				/>

				<label for="postal-code">{m.widget_address_zip()}</label>
				<input
					required
					type="text"
					id="postal-code"
					name="postal-code"
					placeholder={m.widget_address_zip()}
					autocomplete="postal-code"
					enterkeyhint="next"
					class="input rounded-md"
					bind:value={value.postalCode}
					oninput={validateInput}
					aria-label={m.widget_address_zip()}
					aria-invalid={!!validationError}
					aria-describedby={validationError ? `${fieldName}-error` : undefined}
				/>

				<label for="city">{m.widget_address_city()}</label>
				<input
					required
					type="text"
					id="city"
					name="city"
					placeholder={m.widget_address_city()}
					enterkeyhint="next"
					class="input rounded-md"
					bind:value={value.city}
					oninput={validateInput}
					aria-label={m.widget_address_city()}
					aria-invalid={!!validationError}
					aria-describedby={validationError ? `${fieldName}-error` : undefined}
				/>

				<div>
					<button class="input btn mt-2 w-full justify-between" use:popup={CountryCombobox}>
						<span class="capitalize">{listboxValue ?? 'Combobox'}</span>
						<i class="fa-solid fa-caret-down opacity-50"></i>
					</button>
					<div class="card overflow-hidden shadow-xl" data-popup="CountryCombobox">
						<Autocomplete on:keyup={searchCountry}>
							<input type="text" placeholder="Search countries..." />
						</Autocomplete>
						<ListBox rounded="rounded-none">
							{#each filteredCountries as country}
								{#if country && country.en}
									<ListBoxItem
										class="flex gap-2"
										name="medium"
										bind:value={country.en}
										bind:group={listboxValue}
										onchange={() => {
											value.country = String(country.id);
											validateInput();
										}}
									>
										<span class="fi fi-{country.id} mt-1"></span>
										{country.en} - <span class="mt-1 uppercase">{country.id}</span>
									</ListBoxItem>
								{/if}
							{/each}
						</ListBox>
					</div>
				</div>
			</form>
		</address>

		{#if validationError}
			<p id={`${fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
				{validationError}
			</p>
		{/if}
	{:else}
		<p>Mapbox is not enabled. Please provide an API token.</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		min-height: 2.5rem;
	}

	.error {
		border-color: rgb(239 68 68);
	}

	:global(.mapboxgl-ctrl-geocoder) {
		max-width: none;
		width: 100%;
	}
</style>
