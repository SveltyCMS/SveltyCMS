<!-- 
@file src/components/widgets/address/Address.svelte
@component
**Address widget**

```tsx
<Address bind:field={field} />
```
**Props:**
- `field` - {FieldType} - Field type
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { privateEnv } from '@root/config/private';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';

	// Stores
	import { validationStore } from '@stores/store';
	import { type Field } from '@root/src/collections/types';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Mapbox
	import type { Map as MapboxMap } from 'mapbox-gl';
	import mapboxgl from 'mapbox-gl';
	import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
	import 'mapbox-gl/dist/mapbox-gl.css';
	import MapboxLanguage from '@mapbox/mapbox-gl-language';
	import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';
	import { Autocomplete } from '@skeletonlabs/skeleton';

	// Valibot validation
	import * as v from 'valibot';

	// Countries data and types
	import countries from './countries.json';
	import type { AddressData, Country } from './types';

	// Initialize Mapbox
	const mapboxToken = privateEnv.MAPBOX_API_TOKEN;
	const isMapboxEnabled = privateEnv.USE_MAPBOX && mapboxToken;

	// Set the Mapbox token before map initialization
	if (isMapboxEnabled && mapboxToken) {
		mapboxgl.accessToken = mapboxToken;
	}

	interface Props {
		field?: Field;
		value?: AddressData;
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

	let { field, value = defaultAddress }: Props = $props();

	const fieldName = getFieldName(field);

	// State variables
	let validationError = $state<string | null>(null);
	let debounceTimeout: number | undefined;
	let listboxValue = $state('Germany');
	let searchQuery = $state('');
	let filteredCountries = $state<Country[]>(countries as Country[]);
	let map: MapboxMap;

	// Update filtered countries when search query changes
	$effect(() => {
		if (!searchQuery) {
			filteredCountries = countries as Country[];
			return;
		}
		const query = searchQuery.toLowerCase();
		filteredCountries = (countries as Country[]).filter(
			(country) => country.en.toLowerCase().includes(query) || String(country.id).toLowerCase().includes(query)
		);
	});

	// Initialize value if needed
	$effect(() => {
		if (!value) {
			value = { ...defaultAddress };
		}
	});

	// Update translation progress
	$effect(() => {
		updateTranslationProgress({}, field);
	});

	// Popup settings
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
				v.parse(addressSchema, value);
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

	// Improved country search function
	function searchCountry(event: Event) {
		searchQuery = (event.target as HTMLInputElement).value;
	}

	function initMap() {
		if (!isMapboxEnabled) return;

		map = new mapboxgl.Map({
			container: 'map',
			style: 'mapbox://styles/mapbox/streets-v12',
			center: [6.6054765, 51.3395072],
			zoom: 10
		}) as MapboxMap;

		const language = new MapboxLanguage();
		map.addControl(language);

		const geocoder = new MapboxGeocoder({
			accessToken: mapboxToken,
			mapboxgl: mapboxgl
		});

		map.addControl(geocoder);

		map.on('load', () => {
			map?.resize();
		});

		const marker = new mapboxgl.Marker({
			draggable: true
		})
			.setLngLat([6.6054765, 51.3395072])
			.addTo(map);

		marker.on('dragend', (e) => {
			const lngLat = e.target.getLngLat();
			if (value) {
				value.latitude = lngLat.lat.toString();
				value.longitude = lngLat.lng.toString();
			}
		});

		map.addControl(new mapboxgl.NavigationControl());
		map.addControl(new mapboxgl.FullscreenControl());
	}

	onMount(() => {
		const container = document.getElementById('map');
		if (container) {
			initMap();
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
		<address class="w-full" class:error={!!validationError}>
			<div class="mb-1 flex justify-between gap-2">
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

				<!-- Country with search Combobox -->
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
							{/each}
						</ListBox>
					</div>
				</div>
			</form>
		</address>

		<!-- Error Message -->
		{#if validationError}
			<p id={`${fieldName}-error}`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
				{validationError}
			</p>
		{/if}
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
