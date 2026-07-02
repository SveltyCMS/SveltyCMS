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
				<input aria-label="Zoom level"
					type="range"
					min={minZoom}
					max={maxZoom}
					step="5"
					value={sliderValue.value}
					oninput={handleSliderChange}
					class="slider-input"
					aria-label="Zoom level slider"
				/>
				<div class="dock-pill-group zoom-value-group">
					<label class="zoom-value-pill">
						<input aria-label="Zoom step"
							type="number"
							min={minZoom}
							max={maxZoom}
							value={sliderValue.value}
							onchange={handleInputChange}
							class="zoom-value-input"
							aria-label="Zoom level percentage"
						/>
						<span class="zoom-value-suffix" aria-hidden="true">%</span>
					</label>
				</div>
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
		flex: 1 1 10rem;
		max-width: 16rem;
		margin-inline: 0;
	}

	.zoom-slider-block .slider-track {
		align-items: center;
	}

	.zoom-value-group {
		flex-shrink: 0;
		justify-content: center;
		padding-inline: 0.125rem;
	}

	.zoom-value-pill {
		display: inline-flex;
		gap: 0;
		align-items: center;
		justify-content: center;
		height: 1.75rem;
		min-width: 2.75rem;
		padding-inline: 0.5rem;
		cursor: text;
	}

	.zoom-value-input {
		width: auto;
		min-width: 0;
		max-width: 3.25ch;
		padding: 0;
		font-size: 0.6875rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		color: var(--editor-chrome-text-hover, rgba(255, 255, 255, 0.92));
		text-align: center;
		background: transparent;
		border: none;
		outline: none;
		field-sizing: content;
		-moz-appearance: textfield;
		appearance: textfield;
	}

	.zoom-value-input::-webkit-outer-spin-button,
	.zoom-value-input::-webkit-inner-spin-button {
		margin: 0;
		-webkit-appearance: none;
		appearance: none;
	}

	.zoom-value-input:focus {
		outline: none;
	}

	.zoom-value-suffix {
		flex-shrink: 0;
		font-size: 0.6875rem;
		font-weight: 500;
		line-height: 1;
		color: var(--editor-chrome-text-hover, rgba(255, 255, 255, 0.92));
	}
</style>
