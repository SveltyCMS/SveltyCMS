<!--
@file src/routes/(app)/imageEditor/Filter.svelte
@component
**This component allows users to apply various filters to an image, such as brightness, contrast, saturation, hue, blur, and more**
-->
<script lang="ts">
	import Konva from 'konva';

	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		imageNode: Konva.Image;
		onFilterApplied?: () => void;
	}

	const { stage, layer, imageNode, onFilterApplied = () => {} } = $props() as Props;

	$effect.root(() => {
		return () => {
			// Cleanup filters when component unmounts
			imageNode?.filters([]);
			layer?.batchDraw();
		};
	});

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

	let filters: Filters = $state({
		brightness: 0,
		contrast: 0,
		saturation: 0,
		hue: 0,
		blur: 0,
		sepia: false,
		invert: false,
		grayscale: false
	});

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
		onFilterApplied();
	}
</script>

<!-- Filter Controls UI -->

<div class="wrapper">
	<div class="align-center mb-2 flex w-full items-center">
		<div class="flex w-full items-center justify-between">
			<div class="flex items-center gap-2">
				<!-- Back button at top of component -->
				<button onclick={exitFilters} aria-label="Exit rotation mode" class="variant-outline-tertiary btn-icon">
					<iconify-icon icon="material-symbols:close-rounded" width="20"></iconify-icon>
				</button>

				<h3 class="relative text-center text-lg font-bold text-tertiary-500 dark:text-primary-500">Text Overlay Settings</h3>
			</div>
		</div>
		<div class="flex justify-between space-x-2">
			<button onclick={resetFilters} class="variant-filled-error btn w-full" aria-label="Reset all filters"> Reset Filters </button>
			<button onclick={exitFilters} class="variant-filled-primary btn w-full" aria-label="Apply filters and return to editor"> Apply </button>
		</div>
	</div>
	<h2 class="text-center text-lg font-bold text-tertiary-500 dark:text-primary-500">Filter</h2>

	<div class="grid grid-cols-2 gap-2">
		<label class="flex flex-col">
			<span class="mb-1">Brightness: <span class="text-tertiary-500 dark:text-primary-500">{formatValue(filters.brightness)} </span></span>
			<input
				type="range"
				min="-1"
				max="1"
				step="0.05"
				bind:value={filters.brightness}
				oninput={() => applyFilter('brightness', filters.brightness)}
				class="range range-primary"
				aria-label="Adjust brightness"
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
				oninput={() => applyFilter('contrast', filters.contrast)}
				class="range range-primary"
				aria-label="Adjust contrast"
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
				oninput={() => applyFilter('saturation', filters.saturation)}
				class="range range-primary"
				aria-label="Adjust saturation"
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
				oninput={() => applyFilter('hue', filters.hue)}
				class="range range-primary"
				aria-label="Adjust hue"
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
				oninput={() => applyFilter('blur', filters.blur)}
				class="range range-primary"
				aria-label="Adjust blur"
			/>
		</label>
	</div>

	<div class="mt-4 grid grid-cols-3 gap-4">
		<label class="flex items-center">
			<input
				type="checkbox"
				bind:checked={filters.sepia}
				onchange={() => applyFilter('sepia', filters.sepia)}
				class="checkbox-primary checkbox mr-2"
				aria-label="Apply sepia filter"
			/>
			Sepia
		</label>
		<label class="flex items-center">
			<input
				type="checkbox"
				bind:checked={filters.invert}
				onchange={() => applyFilter('invert', filters.invert)}
				class="checkbox-primary checkbox mr-2"
				aria-label="Apply invert filter"
			/>
			Invert
		</label>
		<label class="flex items-center">
			<input
				type="checkbox"
				bind:checked={filters.grayscale}
				onchange={() => applyFilter('grayscale', filters.grayscale)}
				class="checkbox-primary checkbox mr-2"
				aria-label="Apply grayscale filter"
			/>
			Grayscale
		</label>
	</div>
</div>
