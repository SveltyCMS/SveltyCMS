<!--
@file: src/components/image-editor/widgets/zoom/controls.svelte
@component
Pintura-style zoom bottom dock controls.
-->

<script lang="ts">
	let {
		zoomLevel = 100,
		minZoom = 10,
		maxZoom = 500,
		onZoomIn = () => {},
		onZoomOut = () => {},
		onZoomChange = (_percent: number) => {},
		onFitToScreen = () => {},
		onFillScreen = () => {},
		onActualSize = () => {}
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

	let localSliderValue = $state<number | undefined>(undefined);
	let sliderValue = {
		get value() {
			return localSliderValue ?? zoomLevel;
		},
		set value(v: number) {
			localSliderValue = v;
		}
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

<div class="editor-dock" role="toolbar" aria-label="Zoom controls">
	<div class="dock-row dock-row-scroll">
		<div class="dock-pill-group">
			<button
				type="button"
				class="dock-pill"
				onclick={onZoomOut}
				disabled={zoomLevel <= minZoom}
				title="Zoom out"
				aria-label="Zoom out"
			>
				<iconify-icon icon="mdi:minus" width="15" aria-hidden="true"></iconify-icon>
			</button>
			<button
				type="button"
				class="dock-pill"
				onclick={onZoomIn}
				disabled={zoomLevel >= maxZoom}
				title="Zoom in"
				aria-label="Zoom in"
			>
				<iconify-icon icon="mdi:plus" width="15" aria-hidden="true"></iconify-icon>
			</button>
		</div>

		<div class="slider-block zoom-slider-block">
			<div class="slider-track">
				<input
					type="range"
					min={minZoom}
					max={maxZoom}
					step="5"
					value={sliderValue.value}
					oninput={handleSliderChange}
					class="slider-input"
					aria-label="Zoom level slider"
				/>
				<input
					type="number"
					min={minZoom}
					max={maxZoom}
					value={sliderValue.value}
					onchange={handleInputChange}
					class="dock-input w-12 text-center"
					aria-label="Zoom level percentage"
				/>
				<span class="slider-value slider-value-changed">%</span>
			</div>
		</div>

		<div class="dock-pill-group">
			<button type="button" class="dock-pill" onclick={onFitToScreen} title="Fit to screen" aria-label="Fit image to screen">
				<iconify-icon icon="mdi:fit-to-screen-outline" width="15" aria-hidden="true"></iconify-icon>
				<span>Fit</span>
			</button>
			<button type="button" class="dock-pill" onclick={onFillScreen} title="Fill screen" aria-label="Fill screen with image">
				<iconify-icon icon="mdi:fullscreen" width="15" aria-hidden="true"></iconify-icon>
				<span>Fill</span>
			</button>
			<button type="button" class="dock-pill" onclick={onActualSize} title="Actual size (100%)" aria-label="View at actual size">
				<iconify-icon icon="mdi:image-size-select-actual" width="15" aria-hidden="true"></iconify-icon>
				<span>100%</span>
			</button>
		</div>
	</div>
</div>

<style>
	@import '../../editor-dock.css';

	.zoom-slider-block {
		flex: 1 1 12rem;
		max-width: 20rem;
		margin-inline: 0;
	}
</style>
