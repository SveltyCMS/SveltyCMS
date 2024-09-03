<!-- Filter.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	const dispatch = createEventDispatcher();

	let filters = {
		brightness: 0,
		contrast: 0,
		saturation: 0,
		hue: 0,
		blur: 0,
		sepia: false,
		invert: false,
		grayscale: false
	};

	function applyFilter(filterType: string, value: number | boolean) {
		filters[filterType] = value;
		dispatch('filter', { filterType, value });
	}

	function resetFilters() {
		filters = {
			brightness: 0,
			contrast: 0,
			saturation: 0,
			hue: 0,
			blur: 0,
			sepia: false,
			invert: false,
			grayscale: false
		};
		dispatch('resetFilters');
	}

	function formatValue(value: number, suffix: string = ''): string {
		return `${value.toFixed(2)}${suffix}`;
	}
</script>

<div class="filter-controls absolute right-4 top-4 z-50 rounded-md bg-gray-800 p-4 text-white">
	<h3 class="mb-4 text-lg font-bold">Image Filters</h3>

	<div class="mb-4 grid grid-cols-2 gap-4">
		<label class="flex flex-col">
			<span class="mb-1">Brightness: {formatValue(filters.brightness)}</span>
			<input
				type="range"
				min="-1"
				max="1"
				step="0.05"
				bind:value={filters.brightness}
				on:input={() => applyFilter('brightness', filters.brightness)}
			/>
		</label>
		<label class="flex flex-col">
			<span class="mb-1">Contrast: {formatValue(filters.contrast, '%')}</span>
			<input type="range" min="-100" max="100" step="5" bind:value={filters.contrast} on:input={() => applyFilter('contrast', filters.contrast)} />
		</label>
		<label class="flex flex-col">
			<span class="mb-1">Saturation: {formatValue(filters.saturation)}</span>
			<input
				type="range"
				min="-2"
				max="10"
				step="0.1"
				bind:value={filters.saturation}
				on:input={() => applyFilter('saturation', filters.saturation)}
			/>
		</label>
		<label class="flex flex-col">
			<span class="mb-1">Hue: {formatValue(filters.hue, '°')}</span>
			<input type="range" min="0" max="360" step="5" bind:value={filters.hue} on:input={() => applyFilter('hue', filters.hue)} />
		</label>
		<label class="flex flex-col">
			<span class="mb-1">Blur: {formatValue(filters.blur, 'px')}</span>
			<input type="range" min="0" max="40" step="1" bind:value={filters.blur} on:input={() => applyFilter('blur', filters.blur)} />
		</label>
	</div>

	<div class="mb-4 grid grid-cols-3 gap-4">
		<label class="flex items-center">
			<input type="checkbox" bind:checked={filters.sepia} on:change={() => applyFilter('sepia', filters.sepia)} class="mr-2" />
			Sepia
		</label>
		<label class="flex items-center">
			<input type="checkbox" bind:checked={filters.invert} on:change={() => applyFilter('invert', filters.invert)} class="mr-2" />
			Invert
		</label>
		<label class="flex items-center">
			<input type="checkbox" bind:checked={filters.grayscale} on:change={() => applyFilter('grayscale', filters.grayscale)} class="mr-2" />
			Grayscale
		</label>
	</div>

	<button on:click={resetFilters} class="gradient-tertiary btn w-full"> Reset Filters </button>
</div>

<style>
	.filter-controls {
		background-color: rgba(0, 0, 0, 0.6);
		max-width: 400px;
	}

	input[type='range'] {
		width: 100%;
		margin: 0;
	}

	input[type='checkbox'] {
		accent-color: #4ade80;
	}
</style>
