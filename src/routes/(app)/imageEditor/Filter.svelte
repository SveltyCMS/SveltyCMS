<!-- 
@file src/routes/(app)/imageEditor/Filter.svelte
@description This component allows users to apply various filters to an image, such as brightness, contrast, saturation, hue, blur, and more.
-->

<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Konva from 'konva';

	export let stage: Konva.Stage;
	export let layer: Konva.Layer;
	export let imageNode: Konva.Image;

	const dispatch = createEventDispatcher();

	interface Filters {
		brightness: number;
		contrast: number;
		saturation: number;
		hue: number;
		blur: number;
		sepia: boolean;
		invert: boolean;
		grayscale: boolean;
		[key: string]: number | boolean;
	}

	let filters: Filters = {
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

		// Apply filters to the image node
		const activeFilters: ((imageData: ImageData) => void)[] = [];

		if (filters.brightness !== 0) {
			activeFilters.push(Konva.Filters.Brighten);
			imageNode.brightness(filters.brightness);
		}

		if (filters.contrast !== 0) {
			activeFilters.push(Konva.Filters.Contrast);
			imageNode.contrast(filters.contrast);
		}

		if (filters.saturation !== 0) {
			activeFilters.push(Konva.Filters.HSL);
			imageNode.saturation(filters.saturation);
		}

		if (filters.hue !== 0) {
			activeFilters.push(Konva.Filters.HSL);
			imageNode.hue(filters.hue);
		}

		if (filters.blur > 0) {
			activeFilters.push(Konva.Filters.Blur);
			imageNode.blurRadius(filters.blur);
		}

		if (filters.sepia) {
			activeFilters.push(Konva.Filters.Sepia);
		}

		if (filters.invert) {
			activeFilters.push(Konva.Filters.Invert);
		}

		if (filters.grayscale) {
			activeFilters.push(Konva.Filters.Grayscale);
		}

		imageNode.filters(activeFilters);
		layer.batchDraw();

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

		imageNode.filters([]);
		imageNode.brightness(0);
		imageNode.contrast(0);
		imageNode.saturation(0);
		imageNode.hue(0);
		imageNode.blurRadius(0);
		layer.batchDraw();

		dispatch('resetFilters');
	}

	function formatValue(value: number, suffix: string = ''): string {
		return `${value.toFixed(2)}${suffix}`;
	}

	function exitFilters() {
		dispatch('exitFilters');
	}

	function exitShapeOverlay() {
		dispatch('exitShapeOverlay');
	}
</script>

<!-- Filter Controls UI -->
<div class="wrapper">
	<h3 class=" relative text-center text-lg font-bold text-tertiary-500 dark:text-primary-500">Filter</h3>

	<button on:click={exitShapeOverlay} class="variant-ghost-primary btn-icon absolute -top-2 right-2 font-bold"> Exit </button>
	<div class="grid grid-cols-2 gap-2">
		<label class="flex flex-col">
			<span class="mb-1">Brightness: <span class="text-tertiary-500 dark:text-primary-500">{formatValue(filters.brightness)} </span></span>
			<input
				type="range"
				min="-1"
				max="1"
				step="0.05"
				bind:value={filters.brightness}
				on:input={() => applyFilter('brightness', filters.brightness)}
				class="range range-primary"
			/>
		</label>
		<label class="flex flex-col">
			<span class="mb-1">Contrast: <span class="text-tertiary-500 dark:text-primary-500">{formatValue(filters.contrast, '%')}</span></span>
			<input
				type="range"
				min="-100"
				max="100"
				step="5"
				bind:value={filters.contrast}
				on:input={() => applyFilter('contrast', filters.contrast)}
				class="range range-primary"
			/>
		</label>
		<label class="flex flex-col">
			<span class="mb-1">Saturation: <span class="text-tertiary-500 dark:text-primary-500">{formatValue(filters.saturation)}</span></span>
			<input
				type="range"
				min="-2"
				max="10"
				step="0.1"
				bind:value={filters.saturation}
				on:input={() => applyFilter('saturation', filters.saturation)}
				class="range range-primary"
			/>
		</label>
		<label class="flex flex-col">
			<span class="mb-1">Hue: <span class="text-tertiary-500 dark:text-primary-500">{formatValue(filters.hue, '°')}</span></span>
			<input
				type="range"
				min="0"
				max="360"
				step="5"
				bind:value={filters.hue}
				on:input={() => applyFilter('hue', filters.hue)}
				class="range range-primary"
			/>
		</label>
		<label class="flex flex-col">
			<span class="mb-1">Blur: <span class="text-tertiary-500 dark:text-primary-500">{formatValue(filters.blur, 'px')}</span></span>
			<input
				type="range"
				min="0"
				max="40"
				step="1"
				bind:value={filters.blur}
				on:input={() => applyFilter('blur', filters.blur)}
				class="range range-primary"
			/>
		</label>
	</div>

	<div class="mt-4 grid grid-cols-3 gap-4">
		<label class="flex items-center">
			<input
				type="checkbox"
				bind:checked={filters.sepia}
				on:change={() => applyFilter('sepia', filters.sepia)}
				class="checkbox-primary checkbox mr-2"
			/>
			Sepia
		</label>
		<label class="flex items-center">
			<input
				type="checkbox"
				bind:checked={filters.invert}
				on:change={() => applyFilter('invert', filters.invert)}
				class="checkbox-primary checkbox mr-2"
			/>
			Invert
		</label>
		<label class="flex items-center">
			<input
				type="checkbox"
				bind:checked={filters.grayscale}
				on:change={() => applyFilter('grayscale', filters.grayscale)}
				class="checkbox-primary checkbox mr-2"
			/>
			Grayscale
		</label>
	</div>

	<div class="mt-4 flex justify-between space-x-2">
		<button on:click={resetFilters} class="variant-filled-error btn w-full">Reset Filters</button>
		<button on:click={exitFilters} class="variant-filled-primary btn w-full">Apply</button>
	</div>
</div>
