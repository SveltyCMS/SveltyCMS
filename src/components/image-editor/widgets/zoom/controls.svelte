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

<div class="flex flex-col flex-[0_0_auto] gap-1 items-stretch w-full min-w-0 h-auto leading-none" role="toolbar" aria-label="Zoom controls">
	<div class="flex flex-wrap gap-1.5 items-center justify-center w-full min-w-0 min-h-0 leading-none flex-nowrap overflow-x-auto overflow-y-hidden pb-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full">
			<button
				type="button"
				class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
				onclick={onZoomOut}
				disabled={zoomLevel <= minZoom}
				title="Zoom out"
				aria-label="Zoom out"
			>
				<iconify-icon icon="mdi:minus" width="15" aria-hidden="true"></iconify-icon>
			</button>
			<button
				type="button"
				class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
				onclick={onZoomIn}
				disabled={zoomLevel >= maxZoom}
				title="Zoom in"
				aria-label="Zoom in"
			>
				<iconify-icon icon="mdi:plus" width="15" aria-hidden="true"></iconify-icon>
			</button>
		</div>

		<div class="flex flex-col gap-1 w-full max-w-[36rem] mx-auto flex-[1_1_10rem] max-w-64 mx-0">
			<div class="flex gap-2.5 items-center">
				<input aria-label="Zoom level"
					type="range"
					min={minZoom}
					max={maxZoom}
					step="5"
					value={sliderValue.value}
					oninput={handleSliderChange}
					class="flex-1 h-1 m-0 appearance-none cursor-pointer bg-white/[0.18] rounded-full [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-transparent [&::-moz-range-thumb]:rounded-full"
				/>
				<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full shrink-0 px-0.5">
					<label class="inline-flex gap-0 items-center justify-center h-7 min-w-[2.75rem] px-2 cursor-text">
						<input aria-label="Zoom step"
							type="number"
							min={minZoom}
							max={maxZoom}
							value={sliderValue.value}
							onchange={handleInputChange}
							class="w-auto min-w-0 max-w-[3.25ch] p-0 text-[11px] font-medium tabular-nums leading-none text-[rgba(255,255,255,0.92)] text-center bg-transparent border-none outline-none [field-sizing:content] [-moz-appearance:textfield] [appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none"
						/>
						<span class="shrink-0 text-[11px] font-medium leading-none text-[rgba(255,255,255,0.92)]" aria-hidden="true">%</span>
					</label>
				</div>
			</div>
		</div>

		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full">
			<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onclick={onFitToScreen} title="Fit to screen" aria-label="Fit image to screen">
				<iconify-icon icon="mdi:fit-to-screen-outline" width="15" aria-hidden="true"></iconify-icon>
				<span>Fit</span>
			</button>
			<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onclick={onFillScreen} title="Fill screen" aria-label="Fill screen with image">
				<iconify-icon icon="mdi:fullscreen" width="15" aria-hidden="true"></iconify-icon>
				<span>Fill</span>
			</button>
			<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onclick={onActualSize} title="Actual size (100%)" aria-label="View at actual size">
				<iconify-icon icon="mdi:image-size-select-actual" width="15" aria-hidden="true"></iconify-icon>
				<span>100%</span>
			</button>
		</div>
	</div>
</div>
