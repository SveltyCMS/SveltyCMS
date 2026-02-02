<!--
@file: src/components/imageEditor/widgets/Zoom/Controls.svelte
@component
**Zoom Tool Controls**

Toolbar controls for the Zoom tool:
- Zoom in/out buttons
- Zoom slider
- Fit to screen button
- Fill screen button
- 100% (Actual Size) button
- Reset button
-->

<script lang="ts">
	import { untrack } from 'svelte';

	// Props from Tool.svelte
	let {
		zoomLevel = 100,
		minZoom = 10,
		maxZoom = 500,
		onZoomIn = () => {},
		onZoomOut = () => {},
		onZoomChange = (_percent: number) => {},
		onFitToScreen = () => {},
		onFillScreen = () => {},
		onActualSize = () => {},
		onReset = () => {},
		onCancel = () => {},
		onApply = () => {}
	}: {
		zoomLevel?: number;
		minZoom?: number;
		maxZoom?: number;
		onZoomIn?: () => void;
		onZoomOut?: () => void;
		onZoomChange?: (percent: number) => void;
		onFitToScreen?: () => void;
		onFillScreen?: () => void;
		onActualSize?: () => void;
		onReset?: () => void;
		onCancel?: () => void;
		onApply?: () => void;
	} = $props();

	// Local state for slider - derived from props but mutable for local interaction
	let sliderValue = $state(untrack(() => zoomLevel));

	// Sync local state when prop changes
	$effect(() => {
		sliderValue = zoomLevel;
	});

	function handleSliderChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const value = parseInt(target.value) || 100;
		sliderValue = value;
		onZoomChange(value);
	}

	function handleInputChange(e: Event) {
		const target = e.target as HTMLInputElement;
		let value = parseInt(target.value) || 100;
		value = Math.max(minZoom, Math.min(maxZoom, value));
		sliderValue = value;
		onZoomChange(value);
	}
</script>

<div class="zoom-controls flex flex-wrap items-center justify-center gap-2 px-2">
	<!-- Zoom Out Button -->
	<button
		onclick={onZoomOut}
		class="btn-icon preset-outlined-surface-500 shrink-0 h-7 w-7"
		title="Zoom Out"
		aria-label="Zoom out"
		disabled={zoomLevel <= minZoom}
	>
		<iconify-icon icon="mdi:magnify-minus-outline" width="16"></iconify-icon>
	</button>

	<!-- Zoom Slider -->
	<div class="flex items-center gap-2">
		<input
			type="range"
			min={minZoom}
			max={maxZoom}
			step="5"
			value={sliderValue}
			oninput={handleSliderChange}
			class="slider h-1.5 w-20 sm:w-28 md:w-36 cursor-pointer appearance-none rounded-lg bg-surface-300 accent-primary-500 dark:bg-surface-600"
			aria-label="Zoom level slider"
		/>
	</div>

	<!-- Zoom In Button -->
	<button
		onclick={onZoomIn}
		class="btn-icon preset-outlined-surface-500 shrink-0 h-7 w-7"
		title="Zoom In"
		aria-label="Zoom in"
		disabled={zoomLevel >= maxZoom}
	>
		<iconify-icon icon="mdi:magnify-plus-outline" width="16"></iconify-icon>
	</button>

	<!-- Zoom Level Input -->
	<div class="flex items-center gap-1">
		<input
			type="number"
			min={minZoom}
			max={maxZoom}
			value={sliderValue}
			onchange={handleInputChange}
			class="input w-14 px-1 py-0.5 text-center text-sm"
			aria-label="Zoom level percentage"
		/>
		<span class="text-xs text-surface-500 dark:text-surface-400">%</span>
	</div>

	<!-- Divider -->
	<div class="hidden h-6 w-px bg-surface-300 sm:block dark:bg-surface-600"></div>

	<!-- Fit to Screen -->
	<button
		onclick={onFitToScreen}
		class="btn-icon preset-outlined-surface-500 h-7 w-7 sm:w-auto sm:px-2 sm:py-1 sm:gap-1"
		title="Fit to Screen"
		aria-label="Fit image to screen"
	>
		<iconify-icon icon="mdi:fit-to-screen-outline" width="16"></iconify-icon>
		<span class="hidden sm:inline text-xs">Fit</span>
	</button>

	<!-- Fill Screen -->
	<button
		onclick={onFillScreen}
		class="btn-icon preset-outlined-surface-500 h-7 w-7 sm:w-auto sm:px-2 sm:py-1 sm:gap-1"
		title="Fill Screen"
		aria-label="Fill screen with image"
	>
		<iconify-icon icon="mdi:fullscreen" width="16"></iconify-icon>
		<span class="hidden sm:inline text-xs">Fill</span>
	</button>

	<!-- 100% / Actual Size -->
	<button
		onclick={onActualSize}
		class="btn-icon preset-outlined-surface-500 h-7 w-7 sm:w-auto sm:px-2 sm:py-1 sm:gap-1"
		title="Actual Size (100%)"
		aria-label="View at actual size"
	>
		<iconify-icon icon="mdi:image-size-select-actual" width="16"></iconify-icon>
		<span class="hidden sm:inline text-xs">100%</span>
	</button>

	<!-- Divider -->
	<div class="hidden h-6 w-px bg-surface-300 sm:block dark:bg-surface-600"></div>

	<!-- Reset -->
	<button onclick={onReset} class="btn preset-outlined-surface-500 gap-1 px-2 py-1 text-xs h-7" title="Reset Zoom" aria-label="Reset zoom to initial">
		<iconify-icon icon="mdi:restore" width="16"></iconify-icon>
		<span class="hidden sm:inline">Reset</span>
	</button>

	<!-- Cancel -->
	<button onclick={onCancel} class="btn preset-outlined-error-500 gap-1 px-2 py-1 text-xs h-7" title="Cancel Zoom" aria-label="Cancel zoom changes">
		<iconify-icon icon="mdi:close" width="16"></iconify-icon>
		<span class="hidden sm:inline">Cancel</span>
	</button>

	<!-- Apply -->
	<button onclick={onApply} class="btn preset-filled-primary-500 gap-1 px-2 py-1 text-xs h-7" title="Apply Zoom" aria-label="Apply zoom changes">
		<iconify-icon icon="mdi:check" width="16"></iconify-icon>
		<span class="hidden sm:inline">Apply</span>
	</button>
</div>

<style>
	/* Custom slider styling */
	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: rgb(var(--color-primary-500));
		cursor: pointer;
		border: 2px solid white;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.slider::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: rgb(var(--color-primary-500));
		cursor: pointer;
		border: 2px solid white;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.slider:focus {
		outline: none;
	}

	.slider:focus::-webkit-slider-thumb {
		box-shadow:
			0 0 0 3px rgba(var(--color-primary-500) / 0.3),
			0 2px 4px rgba(0, 0, 0, 0.2);
	}
</style>
