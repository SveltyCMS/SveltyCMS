<!--
@file src/routes/(app)/imageEditor/CropBottomBar.svelte
@component
**Crop tool bottom controls - Pintura-style slider and mode tabs**
Displays rotation/scale sliders below the canvas without blocking view.

### Props
- `activeMode`: Current mode ('rotation' or 'scale')
- `onModeChange`: Function called when mode tab is clicked
- `rotationAngle`: Current rotation angle in degrees
- `onRotationChange`: Function called when rotation changes
- `scaleValue`: Current scale percentage (10-200)
- `onScaleChange`: Function called when scale changes
-->

<script lang="ts">
	interface Props {
		activeMode: 'rotation' | 'scale';
		onModeChange: (mode: 'rotation' | 'scale') => void;
		rotationAngle: number;
		onRotationChange: (angle: number) => void;
		scaleValue: number;
		onScaleChange: (scale: number) => void;
	}

	const {
		activeMode = $bindable(),
		onModeChange,
		rotationAngle = $bindable(),
		onRotationChange,
		scaleValue = $bindable(),
		onScaleChange
	} = $props() as Props;

	function handleRotationInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const angle = parseInt(input.value);
		onRotationChange(angle);
	}

	function handleScaleInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const scale = parseInt(input.value);
		onScaleChange(scale);
	}
</script>

<div class="crop-bottom-bar">
	<!-- Slider area -->
	<div class="w-full max-w-xl">
		{#if activeMode === 'rotation'}
			<div class="gap-2r relative flex flex-col items-center">
				<input type="range" min="-180" max="180" step="1" value={rotationAngle} oninput={handleRotationInput} class="rotation-slider" />
				<div class="angle-display">{rotationAngle}°</div>
				<div class="slider-dots">
					{#each [-180, -135, -90, -45, 0, 45, 90, 135, 180] as angle}
						<button class="dot" class:active={Math.abs(rotationAngle - angle) < 5} onclick={() => onRotationChange(angle)} title="{angle}°"></button>
					{/each}
				</div>
			</div>
		{:else if activeMode === 'scale'}
			<div class="gap-2-wrapper relative flex flex-col items-center">
				<input type="range" min="10" max="200" step="5" value={scaleValue} oninput={handleScaleInput} class="scale-slider" />
				<div class="angle-display">{scaleValue}%</div>
			</div>
		{/if}
	</div>

	<!-- Mode tabs -->
	<div class="mode-tabs">
		<button class="mode-tab" class:active={activeMode === 'rotation'} onclick={() => onModeChange('rotation')}> Rotation </button>
		<button class="mode-tab" class:active={activeMode === 'scale'} onclick={() => onModeChange('scale')}> Scale </button>
	</div>
</div>

<style>
	.crop-bottom-bar {
		@apply flex flex-col items-center gap-3;
		@apply px-4 py-4;
		background-color: rgb(var(--color-surface-100) / 1);
		border-top: 1px solid rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .crop-bottom-bar {
		background-color: rgb(var(--color-surface-800) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.rotation-slider,
	.scale-slider {
		@apply h-1 w-full rounded-full;
		@apply cursor-pointer appearance-none;
		background: linear-gradient(
			to right,
			rgb(var(--color-surface-300) / 1) 0%,
			rgb(var(--color-primary-500) / 1) 50%,
			rgb(var(--color-surface-300) / 1) 100%
		);
	}

	:global(.dark) .rotation-slider,
	:global(.dark) .scale-slider {
		background: linear-gradient(
			to right,
			rgb(var(--color-surface-600) / 1) 0%,
			rgb(var(--color-primary-500) / 1) 50%,
			rgb(var(--color-surface-600) / 1) 100%
		);
	}

	.scale-slider {
		background: linear-gradient(
			to right,
			rgb(var(--color-surface-300) / 1) 0%,
			rgb(var(--color-primary-500) / 1) 45%,
			rgb(var(--color-surface-300) / 1) 100%
		);
	}

	:global(.dark) .scale-slider {
		background: linear-gradient(
			to right,
			rgb(var(--color-surface-600) / 1) 0%,
			rgb(var(--color-primary-500) / 1) 45%,
			rgb(var(--color-surface-600) / 1) 100%
		);
	}

	.rotation-slider::-webkit-slider-thumb,
	.scale-slider::-webkit-slider-thumb {
		@apply h-4 w-4 appearance-none rounded-full;
		@apply cursor-pointer;
		background-color: white;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
	}

	.rotation-slider::-moz-range-thumb,
	.scale-slider::-moz-range-thumb {
		@apply h-4 w-4 rounded-full border-0;
		@apply cursor-pointer;
		background-color: white;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
	}

	.angle-display {
		@apply absolute -top-8 left-1/2 -translate-x-1/2 transform;
		@apply text-sm font-semibold;
		@apply rounded px-2 py-1;
		background-color: rgba(0, 0, 0, 0.7);
		color: white;
	}

	.slider-dots {
		@apply mt-1 flex w-full justify-between;
		@apply px-1;
	}

	.dot {
		@apply h-1.5 w-1.5 rounded-full;
		@apply transition-all duration-200;
		background-color: rgb(var(--color-surface-400) / 1);
	}

	:global(.dark) .dot {
		background-color: rgb(var(--color-surface-600) / 1);
	}

	.dot.active {
		@apply h-2 w-2;
		background-color: rgb(var(--color-primary-500) / 1);
	}

	.dot:hover {
		@apply scale-125;
		background-color: rgb(var(--color-primary-400) / 1);
	}

	.mode-tabs {
		@apply flex gap-2;
	}

	.mode-tab {
		@apply rounded-full px-4 py-2;
		@apply text-sm font-medium;
		@apply transition-all duration-200;
		background-color: rgb(var(--color-surface-200) / 1);
		color: rgb(var(--color-surface-600) / 1);
	}

	:global(.dark) .mode-tab {
		background-color: rgb(var(--color-surface-700) / 1);
		color: rgb(var(--color-surface-300) / 1);
	}

	.mode-tab:hover {
		background-color: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .mode-tab:hover {
		background-color: rgb(var(--color-surface-600) / 1);
	}

	.mode-tab.active {
		background-color: rgb(var(--color-surface-800) / 1);
		color: white;
	}

	:global(.dark) .mode-tab.active {
		background-color: rgb(var(--color-surface-900) / 1);
	}
</style>
