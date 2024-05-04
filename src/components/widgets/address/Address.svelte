<script lang="ts">
	import type { FieldType } from '.';
	import { privateEnv } from '@root/config/private';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';

	// Stores
	import { mode, entryData, contentLanguage } from '@stores/store';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Mapbox
	import mapboxgl from 'mapbox-gl';
	import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
	import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
	import 'mapbox-gl/dist/mapbox-gl.css';
	import MapboxLanguage from '@mapbox/mapbox-gl-language';

	// https://docs.mapbox.com/help/glossary/access-token/
	mapboxgl.accessToken = privateEnv.MAPBOX_API_TOKEN;

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
		// console.log('Selected option value:', event.detail.value);
		inputPopupDemo = event.detail.label;
	}

	const CountryCombobox: PopupSettings = {
		event: 'click',
		target: 'CountryCombobox',
		placement: 'bottom',
		closeQuery: '.listbox-item'
		// state: (e: any) => console.log('tooltip', e)
	};

	let listboxValue: string = 'Germany';

	// https://stefangabos.github.io/world_countries/
	import countries from './countries.json';
	// import '/node_modules/flag-icons/css/flag-icons.min.css';

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
	export let value = {
		latitude: null,
		longitude: null,
		name: '',
		street: '',
		zip: '',
		city: '',
		country: ''
	};

	$: if (!value) {
		value = {
			latitude: null,
			longitude: null,
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
		accessToken: mapboxgl.accessToken,
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
				accessToken: mapboxgl.accessToken,
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

	var widgetValueObject = {
		db_fieldName: field.db_fieldName,
		icon: field.icon,
		required: field.required
	};

	const addressSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		required: z.boolean().optional()
	});

	// zod validation
	import * as z from 'zod';

	// Customize the error messages for each rule
	const validateSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		color: z.string().optional(),
		size: z.string().optional(),
		width: z.number().optional(),
		required: z.boolean().optional()

		// Widget Specfic
	});

	function validateInput() {
		try {
			// Change .parseAsync to .parse
			validateSchema.parse(_data[_language]);
			validationError = '';
		} catch (error: unknown) {
			if (error instanceof z.ZodError) {
				validationError = error.errors[0].message;
			}
		}
	}
</script>

{#if privateEnv.MAPBOX_API_TOKEN}
	<address class="w-full">
		<div class=" mb-1 flex justify-between gap-2">
			<button class="variant-filled-primary btn btn-base rounded-md text-white"
				><iconify-icon icon="bi:map" width="16" class="mr-2" />{m.widget_address_getfromaddress()}</button
			>
		</div>
		<!-- <div use:initMap class="h-[360px] sm:h-[450px] md:h-[300px] w-full" id="map" /> -->

		<label for="name">{m.widget_address_geocoordinates()}</label>
		<div class="flex justify-center gap-2">
			<input
				required
				type="text"
				id="latitude"
				name="latitude"
				placeholder={m.widget_address_latitude()}
				class="input rounded-md"
				bind:value={value.latitude}
			/>

			<input
				required
				type="text"
				id="longitude"
				name="longitude"
				placeholder={m.widget_address_longitude()}
				class="input rounded-md"
				bind:value={value.longitude}
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
			/>

			<label for="city">{m.widget_address_city()}</label>
			<input
				required
				type="text"
				id="city"
				name="city"
				placeholder="m.widget_address_city()}"
				enterkeyhint="next"
				class="input rounded-md"
				bind:value={value.city}
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
	{#if validationError !== null}
		<p class="text-center text-sm text-error-500">{validationError}</p>
	{/if}
{/if}
<label for="city">Country Autocomplete</label>
<input
	class="autocomplete input"
	type="search"
	name="autocomplete-search"
	bind:value={inputPopupDemo}
	placeholder="Search..."
	use:popup={popupSettings}
/>
<div data-popup="popupAutocomplete">
	<Autocomplete
		bind:input={inputPopupDemo}
		options={countryOptions}
		on:selection={onPopupDemoSelect}
		class="z-10 w-full justify-start bg-surface-900"
	/>
</div>
