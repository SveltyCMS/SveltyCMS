<!-- 
@file src/components/widgets/address/Address.svelte
@description - Address widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { privateEnv } from '@root/config/private';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';

	// Stores
	import { contentLanguage, validationStore } from '@stores/store';
	import { mode, collectionValue } from '@stores/collectionStore';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Mapbox
	import mapboxgl from 'mapbox-gl';
	import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
	import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
	import 'mapbox-gl/dist/mapbox-gl.css';
	import MapboxLanguage from '@mapbox/mapbox-gl-language';

	// https://docs.mapbox.com/help/glossary/access-token/
	if (privateEnv.MAPBOX_API_TOKEN) {
		mapboxgl.accessToken = privateEnv.MAPBOX_API_TOKEN;
	}

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';
	import { Autocomplete } from '@skeletonlabs/skeleton';
	import type { AutocompleteOption } from '@skeletonlabs/skeleton';

	let inputPopupDemo = '';
	const popupSettings: PopupSettings = {
		event: 'focus-click',
		target: 'popupAutocomplete',
		placement: 'bottom'
	};

	interface CountryOption extends AutocompleteOption {
		alpha2?: string;
	}
	const countryOptions: CountryOption[] = countries.map((country) => ({
		label: country.en,
		value: country.id,
		...country
	}));

	function renderCountryOption(option: CountryOption) {
		return `
        <div class="flex items-center z-10 bg-error-500">
            <span class="fi fi-${option.alpha2} mr-2" />
            <span>${option.label}</span>
        </div>
    `;
	}

	function onPopupDemoSelect(event: any): void {
		inputPopupDemo = event.detail.label;
	}

	const CountryCombobox: PopupSettings = {
		event: 'click',
		target: 'CountryCombobox',
		placement: 'bottom',
		closeQuery: '.listbox-item'
	};

	let listboxValue: string = 'Germany';

	// https://stefangabos.github.io/world_countries/
	import countries from './countries.json';

	const selectedCountry = '';

	// Initialize a filtered array of countries that will be displayed in the dropdown menu
	let filteredCountries = countries;

	function searchCountry(event: any) {
		// Get the search query from the input field
		const query = event.target.value.toLowerCase();
		// Filter the countries array based on the search query
		filteredCountries = countries.filter((country) =>
			Object.values(country).some((value) => typeof value === 'string' && value.toLowerCase().includes(query))
		);
	}

	export let field: any = undefined;
	const fieldName = getFieldName(field);
	export let value = {
		latitude: 0,
		longitude: 0,
		name: '',
		street: '',
		zip: '',
		city: '',
		country: ''
	};

	$: if (!value) {
		value = {
			latitude: 0,
			longitude: 0,
			name: '',
			street: '',
			zip: '',
			city: '',
			country: ''
		};
	}

	export let widgetValue;

	const _data = $mode == 'create' ? {} : value;

	$: _language = field?.translated ? $contentLanguage : publicEnv.DEFAULT_CONTENT_LANGUAGE;
	$: updateTranslationProgress(_data, field);

	let validationError: string | null = null;
	let debounceTimeout: number | undefined;

	export const WidgetData = async () => _data;

	$: widgetValue = {
		latitude: value.latitude,
		longitude: value.longitude,
		name: value.name,
		street: value.street,
		zip: value.zip,
		city: value.city,
		country: value.country
	};

	const language = new MapboxLanguage();

	const geocoder = new MapboxGeocoder({
		accessToken: mapboxgl.accessToken || '',
		mapboxgl: mapboxgl
	});

	geocoder.on('result', () => {
		// console.log('aa');
	});

	let map: any;
	function initMap(container: any) {
		map = new mapboxgl.Map({
			container: 'map', // container ID
			// Choose from Mapbox's core styles, or make your own style with Mapbox Studio
			style: 'mapbox://styles/mapbox/streets-v12', // style URL
			center: [6.6054765, 51.3395072], // starting position [lng, lat]  - TODO  Change to environment variable
			zoom: 10 // starting zoom,
		});

		// Add the search control to the map.
		// TODO: display admin user language
		map.addControl(language);

		// Add the search control to the map.
		// TODO: display admin user language
		map.addControl(
			new MapboxGeocoder({
				accessToken: mapboxgl.accessToken || '',
				mapboxgl: mapboxgl
			})
		);

		map.on('load', () => {
			// Create a default Marker and add it to the map.
			//TODO: Mark postion is wrong & Change to environment variable
			map.resize();
		});

		const marker = new mapboxgl.Marker({
			draggable: true
		})
			.setLngLat([6.6054765, 51.3395072])
			.addTo(map);
		marker.on('dragend', function (e) {
			var lngLat = e.target.getLngLat();
			value.latitude = lngLat['lat'];
			value.longitude = lngLat['lng'];
		});

		// Add geolocate control to the map.
		map.addControl(
			new mapboxgl.GeolocateControl({
				positionOptions: {
					enableHighAccuracy: true
				},
				// When active the map will receive updates to the device's location as it changes.
				trackUserLocation: true,
				// Draw an arrow next to the location dot to indicate which direction the device is heading.
				showUserHeading: true
			})
		);
	}

	// valibot validation
	import * as v from 'valibot';

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
</script>

<div class="input-container relative mb-4">
	{#if privateEnv.MAPBOX_API_TOKEN}
		<address class="w-full" class:error={!!validationError}>
			<div class="mb-1 flex justify-between gap-2">
				<button class="variant-filled-primary btn btn-base rounded-md text-white" aria-label={m.widget_address_getfromaddress()}>
					<iconify-icon icon="bi:map" width="16" class="mr-2" />
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
					class="input rounded-md"
					bind:value={value.latitude}
					on:input={validateInput}
					aria-label={m.widget_address_latitude()}
					aria-invalid={!!validationError}
					aria-describedby={validationError ? `${fieldName}-error` : undefined}
				/>

				<input
					required
					type="text"
					id="longitude"
					name="longitude"
					placeholder={m.widget_address_longitude()}
					class="input rounded-md"
					bind:value={value.longitude}
					on:input={validateInput}
					aria-label={m.widget_address_longitude()}
					aria-invalid={!!validationError}
					aria-describedby={validationError ? `${fieldName}-error` : undefined}
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
					on:input={validateInput}
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
					on:input={validateInput}
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
					on:input={validateInput}
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
					on:input={validateInput}
					aria-label={m.widget_address_city()}
					aria-invalid={!!validationError}
					aria-describedby={validationError ? `${fieldName}-error` : undefined}
				/>

				<!-- Country with search Combobox -->
				<div>
					<button class="input btn mt-2 w-full justify-between" use:popup={CountryCombobox}>
						<span class="capitalize">{listboxValue ?? 'Combobox'}</span>
						<i class="fa-solid fa-caret-down opacity-50" />
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
									<span class="fi fi-{country.alpha2} mt-1" />
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
