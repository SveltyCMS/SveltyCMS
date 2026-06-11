<!--
@file: src/components/image-editor/widgets/Zoom/Controls.svelte
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
} = $props();

// Local state for slider - derived from props but mutable for local interaction
let localSliderValue = $state<number | undefined>(undefined);
let sliderValue = {
	get value() {
		return localSliderValue ?? zoomLevel;
	},
	set value(v: number) {
		localSliderValue = v;
	},
};

function handleSliderChange(e: Event) {
	const target = e.target as HTMLInputElement;
	const value = Number.parseInt(target.value, 10) || 100;
	sliderValue.value = value;
	onZoomChange(value);
}

function handleInputChange(e: Event) {
	const target = e.target as HTMLInputElement;
	let value = Number.parseInt(target.value, 10) || 100;
	value = Math.max(minZoom, Math.min(maxZoom, value));
	sliderValue.value = value;
	onZoomChange(value);
}
</script>

<div class="zoom-controls flex flex-wrap items-center justify-center gap-2 px-2 text-surface-200">
	<!-- Zoom Out Button -->
	<button
		onclick={onZoomOut}
		class="btn-icon shrink-0 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/6 text-surface-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-primary-400/40 hover:bg-tertiary-500 dark:bg-primary-500/12 hover:text-white disabled:opacity-35"
		title="Zoom Out"
		aria-label="Zoom out"
		disabled={zoomLevel <= minZoom}
	>
		<iconify-icon icon="mdi:magnify-minus-outline" width="16"></iconify-icon>
	</button>

	<!-- Zoom Slider -->
	<div class="zoom-slider-shell flex h-9 items-center gap-2 rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(39,39,39,0.95),rgba(24,24,24,0.95))] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
		<input
			type="range"
			min={minZoom}
			max={maxZoom}
			step="5"
			value={sliderValue.value}
			oninput={handleSliderChange}
			class="slider h-1.5 cursor-pointer appearance-none rounded-full bg-white/15 sm:w-28 md:w-36"
			aria-label="Zoom level slider"
		/>
	</div>

	<!-- Zoom In Button -->
	<button
		onclick={onZoomIn}
		class="btn-icon shrink-0 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/6 text-surface-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-primary-400/40 hover:bg-tertiary-500 dark:bg-primary-500/12 hover:text-white disabled:opacity-35"
		title="Zoom In"
		aria-label="Zoom in"
		disabled={zoomLevel >= maxZoom}
	>
		<iconify-icon icon="mdi:magnify-plus-outline" width="16"></iconify-icon>
	</button>

	<!-- Zoom Level Input -->
	<div class="zoom-input-group flex items-center gap-1">
		<input
			type="number"
			min={minZoom}
			max={maxZoom}
			value={sliderValue.value}
			onchange={handleInputChange}
			class="input w-14 rounded border border-white/8 bg-white/5 px-1.5 py-1 text-center font-mono text-sm text-surface-100 focus:border-primary-400/50 focus:ring-0 focus:text-white"
			style="background: transparent;"
			aria-label="Zoom level percentage"
		/>
		<span class="text-xs text-surface-400">%</span>
	</div>

	<!-- Fit to Screen -->
	<button
		onclick={onFitToScreen}
		class="zoom-action btn-icon ms-2 flex h-8 w-8 items-center justify-center gap-1 rounded-full border border-white/10 bg-white/6 text-surface-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-primary-400/40 hover:bg-tertiary-500 dark:bg-primary-500/12 hover:text-white sm:w-auto sm:px-2.5 sm:py-1.5"
		title="Fit to Screen"
		aria-label="Fit image to screen"
	>
		<iconify-icon icon="mdi:fit-to-screen-outline" width="16"></iconify-icon>
		<span class="hidden sm:inline text-xs">Fit</span>
	</button>

	<!-- Fill Screen -->
	<button
		onclick={onFillScreen}
		class="zoom-action btn-icon flex h-8 w-8 items-center justify-center gap-1 rounded-full border border-white/10 bg-white/6 text-surface-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-primary-400/40 hover:bg-tertiary-500 dark:bg-primary-500/12 hover:text-white sm:w-auto sm:px-2.5 sm:py-1.5"
		title="Fill Screen"
		aria-label="Fill screen with image"
	>
		<iconify-icon icon="mdi:fullscreen" width="16"></iconify-icon>
		<span class="hidden sm:inline text-xs">Fill</span>
	</button>

	<!-- 100% / Actual Size -->
	<!-- 100% / Actual Size -->
	<button
		onclick={onActualSize}
		class="zoom-action btn-icon ms-2 flex h-8 items-center justify-center gap-1 rounded-full border border-white/10 bg-white/6 px-2.5 py-1.5 text-xs text-surface-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-primary-400/40 hover:bg-tertiary-500 dark:bg-primary-500/12 hover:text-white"
		title="Actual Size (100%)"
		aria-label="View at actual size"
	>
		<iconify-icon icon="mdi:image-size-select-actual" width="16"></iconify-icon>
		<span class="hidden sm:inline">100%</span>
	</button>
</div>

<style>
	/* Custom slider styling */
	.slider::-webkit-slider-thumb {
		width: 18px;
		height: 18px;
		-webkit-appearance: none;
		appearance: none;
		cursor: pointer;
		background: linear-gradient(180deg, rgba(177, 255, 92, 1), rgba(111, 223, 60, 1));
		border: 2px solid rgba(19, 19, 19, 0.92);
		border-radius: 50%;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.slider::-moz-range-thumb {
		width: 18px;
		height: 18px;
		cursor: pointer;
		background: linear-gradient(180deg, rgba(177, 255, 92, 1), rgba(111, 223, 60, 1));
		border: 2px solid rgba(19, 19, 19, 0.92);
		border-radius: 50%;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.slider:focus {
		outline: none;
	}

	.slider:focus::-webkit-slider-thumb {
		box-shadow:
			0 0 0 3px rgba(136, 255, 89, 0.24),
			0 2px 4px rgba(0, 0, 0, 0.2);
	}

	@media (max-width: 768px) {
		.zoom-controls {
			align-items: stretch;
			justify-content: flex-start;
			gap: 0.5rem;
			padding-inline: 0;
		}

		.zoom-slider-shell {
			order: 1;
			width: 100%;
			min-width: 0;
			padding-inline: 0.9rem;
		}

		.zoom-slider-shell .slider {
			width: 100%;
		}

		.zoom-input-group {
			order: 2;
			min-width: 4.5rem;
		}

		.zoom-action {
			order: 3;
			margin-left: 0 !important;
		}

		.zoom-controls .btn-icon {
			height: 2.4rem;
		}
	}
</style>
