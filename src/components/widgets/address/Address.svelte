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
	import type { FieldType } from '.';
	import { privateEnv } from '@root/config/private';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';

	// Stores
	import { contentLanguage, validationStore } from '@stores/store';
	import { mode, collectionValue } from '@root/src/stores/collectionStore.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Mapbox
	import mapboxgl from 'mapbox-gl';
	import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
	import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
	import 'mapbox-gl/dist/mapbox-gl.css';
	import MapboxLanguage from '@mapbox/mapbox-gl-language';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';
	import { Autocomplete } from '@skeletonlabs/skeleton';
	import type { AutocompleteOption } from '@skeletonlabs/skeleton';

	// Valibot validation
	import * as v from 'valibot';

	// Countries data
	import countries from './countries.json';

	// Initialize Mapbox
	if (privateEnv.MAPBOX_API_TOKEN) {
		mapboxgl.accessToken = privateEnv.MAPBOX_API_TOKEN;
	}

	interface Props {
		field?: any;
		value?: any;
		widgetValue?: any;
	}

	interface AddressData {
		latitude: number;
		longitude: number;
		name: string;
		street: string;
		zip: string;
		city: string;
		country: string;
	}

	interface CountryOption extends AutocompleteOption {
		alpha2?: string;
	}

	const defaultAddress: AddressData = {
		latitude: 0,
		longitude: 0,
		name: '',
		street: '',
		zip: '',
		city: '',
		country: ''
	};

	let { field, value = $bindable(defaultAddress), widgetValue = $bindable() }: Props = $props();

	const fieldName = getFieldName(field);

	// State variables
	let validationError = $state<string | null>(null);
	let debounceTimeout: number | undefined;
	let listboxValue = $state('Germany');
	let filteredCountries = $state(countries);
	let map = $state<mapboxgl.Map | null>(null);

	// Computed values
	let _language = $derived(field?.translated ? contentLanguage.value : publicEnv.DEFAULT_CONTENT_LANGUAGE);

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

	// Sync widgetValue with value
	$effect(() => {
		widgetValue = { ...value };
	});

	// Popup settings
	const CountryCombobox: PopupSettings = {
		event: 'click',
		target: 'CountryCombobox',
		placement: 'bottom',
		closeQuery: '.listbox-item'
	};

	// Convert countries to options
	const countryOptions: CountryOption[] = countries.map((country) => ({
		label: country.en,
		value: country.id,
		...country
	}));

	// Validation schema
	const addressSchema = v.object({
		latitude: v.number(),
		longitude: v.number(),
		name: v.string(),
		street: v.string(),
		zip: v.string(),
		city: v.string(),
		country: v.string()
	});

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

	function searchCountry(event: Event) {
		const query = (event.target as HTMLInputElement).value.toLowerCase();
		filteredCountries = countries.filter((country) =>
			Object.values(country).some((value) => typeof value === 'string' && value.toLowerCase().includes(query))
		);
	}

	function initMap(container: HTMLElement) {
		if (!mapboxgl.accessToken) return;

		map = new mapboxgl.Map({
			container: 'map',
			style: 'mapbox://styles/mapbox/streets-v12',
			center: [6.6054765, 51.3395072],
			zoom: 10
		});

		const language = new MapboxLanguage();
		map.addControl(language);

		map.addControl(
			new MapboxGeocoder({
				accessToken: mapboxgl.accessToken,
				mapboxgl: mapboxgl
			})
		);

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
			value.latitude = lngLat.lat;
			value.longitude = lngLat.lng;
		});

		map.addControl(
			new mapboxgl.GeolocateControl({
				positionOptions: {
					enableHighAccuracy: true
				},
				trackUserLocation: true,
				showUserHeading: true
			})
		);
	}

	onMount(() => {
		const container = document.getElementById('map');
		if (container) {
			initMap(container);
		}
	});

	export const WidgetData = async () => value;
</script>

<div class="input-container relative mb-4">
	{#if privateEnv.MAPBOX_API_TOKEN}
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
					bind:value={value.zip}
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
									on:change={() => {
										value.country = country.alpha2;
										validateInput();
									}}
								>
									<span class="fi fi-{country.alpha2} mt-1"></span>
									{country.en} - <span class="mt-1 uppercase">{country.alpha2}</span>
								</ListBoxItem>
							{/each}
						</ListBox>
					</div>
				</div>
			</form>
		</address>

		<!-- Error Message -->
		{#if validationError}
			<p id={`${fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
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
