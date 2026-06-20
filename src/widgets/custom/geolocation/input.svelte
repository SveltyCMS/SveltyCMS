<!-- 
@file src/widgets/custom/geolocation/input.svelte
@component
**Coordinate Picker with Browser Geolocation support**
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
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
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-bold uppercase tracking-widest text-surface-400">Latitude</span>
			<div class="flex w-full overflow-hidden rounded border border-surface-300 dark:border-surface-600 [&>div]:min-w-0 [&>div]:flex-1 [&>div]:space-y-0">
				<Input
					type="number"
					aria-label="Latitude"
					step="0.000001"
					bind:value={lat}
					oninput={updateValue}
					placeholder="0.000000"
					inputClass="h-auto w-full rounded-none border-0 bg-surface-50 py-2 shadow-none focus-visible:ring-0 dark:bg-surface-900"
				/>
				<div class="flex items-center border-s border-surface-300 bg-surface-100 px-3 text-sm text-surface-500 dark:border-surface-600 dark:bg-surface-800">
					N/S
				</div>
			</div>
		</div>

		<!-- Longitude -->
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-bold uppercase tracking-widest text-surface-400">Longitude</span>
			<div class="flex w-full overflow-hidden rounded border border-surface-300 dark:border-surface-600 [&>div]:min-w-0 [&>div]:flex-1 [&>div]:space-y-0">
				<Input
					type="number"
					aria-label="Longitude"
					step="0.000001"
					bind:value={lng}
					oninput={updateValue}
					placeholder="0.000000"
					inputClass="h-auto w-full rounded-none border-0 bg-surface-50 py-2 shadow-none focus-visible:ring-0 dark:bg-surface-900"
				/>
				<div class="flex items-center border-s border-surface-300 bg-surface-100 px-3 text-sm text-surface-500 dark:border-surface-600 dark:bg-surface-800">
					E/W
				</div>
			</div>
		</div>
	</div>

	<Button variant="tertiary" 
		type="button"
		onclick={getCurrentLocation}
		disabled={isLocating}
	 class="w-full flex items-center justify-center gap-2 py-2.5 rounded text-sm font-semibold transition-all dark: shadow-md shadow-primary-500/20 disabled:pointer-events-none">
		{#if isLocating}
			<iconify-icon icon="line-md:loading-twotone-loop" width="20"></iconify-icon>
			Locating...
		{:else}
			<iconify-icon icon="mdi:crosshairs-gps" width="20"></iconify-icon>
			Get Current Location
		{/if}
	</Button>

	<!-- Visual Feedback -->
	{#if value}
		<div class="p-3 bg-surface-100 dark:bg-surface-800 rounded border border-surface-200 dark:border-surface-700 text-xs font-mono text-center">
			GeoJSON: {JSON.stringify(value)}
		</div>
	{/if}
</div>
