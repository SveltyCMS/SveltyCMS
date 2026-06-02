<!-- 
@file src/widgets/custom/geolocation/input.svelte
@component
**Coordinate Picker with Browser Geolocation support**
-->

<script lang="ts">
	import { validationStore } from '@src/stores/store.svelte';
	import { getFieldName } from '@src/utils/utils';
	import type { FieldType } from './index';
	import type { GeoPoint } from './types';

	interface Props {
		field: FieldType;
		value: GeoPoint | null | undefined;
	}

	let { field, value = $bindable(null) }: Props = $props();
	
	let lat = $state(0);
	let lng = $state(0);
	let isLocating = $state(false);

	$effect(() => {
		lat = value?.coordinates[1] ?? (Number(field.defaultLat) || 0);
		lng = value?.coordinates[0] ?? (Number(field.defaultLng) || 0);
	});
	
	const fieldName = $derived(getFieldName(field));

	function updateValue() {
		value = {
			type: 'Point',
			coordinates: [Number(lng), Number(lat)]
		};
		validationStore.setError(fieldName, '');
	}

	function getCurrentLocation() {
		if (!navigator.geolocation) {
			alert("Geolocation is not supported by your browser");
			return;
		}

		isLocating = true;
		navigator.geolocation.getCurrentPosition(
			(position) => {
				lat = position.coords.latitude;
				lng = position.coords.longitude;
				updateValue();
				isLocating = false;
			},
			(error) => {
				console.error("Error getting location:", error);
				alert(`Error: ${error.message}`);
				isLocating = false;
			}
		);
	}
</script>

<div class="space-y-4">
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
		<!-- Latitude -->
		<label class="label">
			<span class="text-xs font-bold uppercase tracking-widest text-surface-400">Latitude</span>
			<div class="input-group input-group-divider grid-cols-[1fr_auto]">
				<input 
					type="number"
					aria-label="Latitude"
					step="0.000001" 
					bind:value={lat} 
					oninput={updateValue}
					placeholder="0.000000"
				/>
				<div class="input-group-shim">N/S</div>
			</div>
		</label>

		<!-- Longitude -->
		<label class="label">
			<span class="text-xs font-bold uppercase tracking-widest text-surface-400">Longitude</span>
			<div class="input-group input-group-divider grid-cols-[1fr_auto]">
				<input 
					type="number"
					aria-label="Longitude"
					step="0.000001" 
					bind:value={lng} 
					oninput={updateValue}
					placeholder="0.000000"
				/>
				<div class="input-group-shim">E/W</div>
			</div>
		</label>
	</div>

	<button 
		type="button" 
		class="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all preset-filled-tertiary-500 dark:preset-filled-primary-500 shadow-md shadow-primary-500/20 disabled:opacity-50 disabled:pointer-events-none"
		onclick={getCurrentLocation}
		disabled={isLocating}
	>
		{#if isLocating}
			<iconify-icon icon="line-md:loading-twotone-loop" width="20"></iconify-icon>
			Locating...
		{:else}
			<iconify-icon icon="mdi:crosshairs-gps" width="20"></iconify-icon>
			Get Current Location
		{/if}
	</button>

	<!-- Visual Feedback -->
	{#if value}
		<div class="p-3 bg-surface-100 dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 text-xs font-mono text-center">
			GeoJSON: {JSON.stringify(value)}
		</div>
	{/if}
</div>
