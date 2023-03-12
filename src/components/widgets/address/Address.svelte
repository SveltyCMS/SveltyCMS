<script lang="ts">
	import { PUBLIC_LANGUAGE, PUBLIC_MAPBOX_API_TOKEN } from '$env/static/public';
	import mapboxgl from 'mapbox-gl';

	// https://docs.mapbox.com/help/glossary/access-token/
	mapboxgl.accessToken = PUBLIC_MAPBOX_API_TOKEN;

	const key = Symbol();

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';

	let CountryCombobox: PopupSettings = {
		event: 'click',
		target: 'CountryCombobox',
		placement: 'bottom',
		closeQuery: '.listbox-item'
		// state: (e: any) => console.log('tooltip', e)
	};
	let listboxValue: string = 'Germany';

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	export let field: any = undefined;
	export let value = '';

	export let widgetValue;
	$: widgetValue = value;

	// https://stefangabos.github.io/world_countries/
	import countries from './countries.json';
	import '/node_modules/flag-icons/css/flag-icons.min.css';

	//import Svelecte from '@src/svelecte';

	let selectedCountry = '';

	// Initialize a filtered array of countries that will be displayed in the dropdown menu
	let filteredCountries = countries;

	function searchCountry(event: any) {
		// Get the search query from the input field
		let query = event.target.value;

		// Filter the countries array based on the search query
		filteredCountries = countries.filter((country) =>
			country.en.toLowerCase().includes(query.toLowerCase())
		);
	}

	// Mapbox
	// TODO hide improve Mapbox add Geolocation

	import { setContext } from 'svelte';
	// import { mapboxgl, key } from './mapboxgl.js';

	import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
	import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';

	import MapboxLanguage from '@mapbox/mapbox-gl-language';
	const language = new MapboxLanguage();

	const geocoder = new MapboxGeocoder({
		accessToken: mapboxgl.accessToken,
		mapboxgl: mapboxgl
	});

	setContext(key, {
		getMap: () => map
	});

	let map: any;

	function initMap(container: any) {
		map = new mapboxgl.Map({
			container: container, // container ID
			// Choose from Mapbox's core styles, or make your own style with Mapbox Studio
			style: 'mapbox://styles/mapbox/streets-v12', // style URL
			center: [6.6054765, 51.3395072], // starting position [lng, lat]  - TODO  Change to environment variable
			zoom: 10 // starting zoom
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
			var marker = new mapboxgl.Marker().setLngLat([6.6054765, 51.3395072]).addTo(map);
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
</script>

{#if PUBLIC_MAPBOX_API_TOKEN}
	<address>
		<!-- TODO: MAP geocoding 
		allow user to switch maps-->
		Mapbox needs more work
		<div use:initMap class="max-h-[550px] w-full">
			<div class=" mb-1 flex justify-between gap-2">
				<button class="variant-filled-primary btn btn-base rounded-md text-white"
					><Icon icon="bi:map" width="16" class="mr-2 " />{$LL.WIDGET_Address_GetAddress()}</button
				>
				<button class="variant-filled-primary btn btn-base rounded-md text-white"
					><Icon
						icon="bi:pin-map"
						width="16"
						class="mr-2 "
					/>{$LL.WIDGET_Address_GetAddress()}</button
				>
			</div>
		</div>

		<label for="name">{$LL.WIDGET_Address_Geocoordinates()}</label>
		<div class="flex justify-center gap-2 ">
			<input
				required
				type="text"
				id="latitude"
				name="latitude"
				autocomplete="latitude"
				placeholder={$LL.WIDGET_Address_Latitude()}
				class="input rounded-md"
			/>

			<input
				required
				type="text"
				id="longitude"
				name="longitude"
				autocomplete="longitude"
				placeholder={$LL.WIDGET_Address_Longitude()}
				class="input rounded-md"
			/>
		</div>
		<br />

		<form>
			<label for="name">{$LL.WIDGET_Address_Name()}</label>
			<input
				required
				type="text"
				id="name"
				name="name"
				autocomplete="name"
				placeholder={$LL.WIDGET_Address_Name()}
				class="input rounded-md"
			/>

			<label for="street-address">{$LL.WIDGET_Address_Street()}</label>
			<input
				type="text"
				id="street-address"
				name="street-address"
				autocomplete="street-address"
				placeholder={$LL.WIDGET_Address_Street()}
				required
				enterkeyhint="next"
				class="input rounded-md"
			/>

			<label for="postal-code">{$LL.WIDGET_Address_Zip()}</label>
			<input
				required
				type="text"
				id="postal-code"
				name="postal-code"
				placeholder={$LL.WIDGET_Address_Zip()}
				autocomplete="postal-code"
				enterkeyhint="next"
				class="input rounded-md"
			/>

			<label for="city">{$LL.WIDGET_Address_City()}</label>
			<input
				required
				type="text"
				id="city"
				name="city"
				placeholder={$LL.WIDGET_Address_City()}
				autocomplete="city"
				enterkeyhint="next"
				class="input rounded-md"
			/>

			<!-- Country with search Combobox -->
			<div>
				<button class="btn variant-filled w-48 justify-between" use:popup={CountryCombobox}>
					<span class="capitalize">{listboxValue ?? 'Combobox'}</span>
					<i class="fa-solid fa-caret-down opacity-50" />
				</button>
				<div class="card w-48 shadow-xl overflow-hidden" data-popup="CountryCombobox">
					<ListBox rounded="rounded-none">
						{#each filteredCountries as country}
							<!-- add system-language -->
							<ListBoxItem
								class="flex gap-2"
								name="medium"
								value={country.en}
								bind:group={listboxValue}
							>
								<span class="fi fi-{country.alpha2} mt-1" />
								{country.en} - <span class="mt-1 uppercase">{country.alpha2}</span>
							</ListBoxItem>
						{/each}
					</ListBox>
				</div>
			</div>

			<!-- <label class="relative mt-3">
			<input
				bind:value={selectedCountry}
				on:keyup={searchCountry}
				use:popup={countrySettings}
				id="country"
				placeholder={$LL.WIDGET_Address_SearchCountry()}
				class="btn btn-base relative w-full rounded-md bg-surface-300 pl-10 text-left text-white dark:bg-surface-600 "
			/>

			<Icon
				icon="ic:baseline-search"
				height="24"
				class="absolute top-3 left-2 text-slate-500 dark:text-surface-400"
			/>
			<nav
				class="card list-nav absolute top-0 left-0 max-h-40 overflow-auto p-4 shadow-xl"
				data-popup="country"
			>
				<ul class=" divide-y divide-surface-500">
					
					{#each filteredCountries as country}
						<li
							class="flex gap-2"
							value={country.en}
							on:click={() => (selectedCountry = country.en)}
						>
							<span class="fi fi-{country.alpha2} mt-1" />
							{country.en} - <span class="mt-1 uppercase">{country.alpha2}</span>
						</li>
					{/each}
				</ul>
			</nav>
		</label> -->
		</form>
	</address>
{/if}
