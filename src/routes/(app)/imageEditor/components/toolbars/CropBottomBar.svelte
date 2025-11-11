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
	<div class="slider-container">
		{#if activeMode === 'rotation'}
			<div class="slider-wrapper">
				<input type="range" min="-180" max="180" step="1" value={rotationAngle} oninput={handleRotationInput} class="rotation-slider" />
				<div class="angle-display">{rotationAngle}°</div>
				<div class="slider-dots">
					{#each [-180, -135, -90, -45, 0, 45, 90, 135, 180] as angle}
						<button class="dot" class:active={Math.abs(rotationAngle - angle) < 5} onclick={() => onRotationChange(angle)} title="{angle}°"></button>
					{/each}
				</div>
			</div>
		{:else if activeMode === 'scale'}
			<div class="slider-wrapper">
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
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding-left: 1rem; padding-right: 1rem;
		padding-top: 1rem; padding-bottom: 1rem;
		background-color: rgb(var(--color-surface-100) / 1);
		border-top: 1px solid rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .crop-bottom-bar {
		background-color: rgb(var(--color-surface-800) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.slider-container {
		width: 100%;
	}

	.slider-wrapper {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.rotation-slider,
	.scale-slider {
		width: 100%;
		border-radius: 9999px;
		cursor: pointer;
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
		border-radius: 9999px;
		cursor: pointer;
		background-color: white;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
	}

	.rotation-slider::-moz-range-thumb,
	.scale-slider::-moz-range-thumb {
		border-radius: 9999px;
		cursor: pointer;
		background-color: white;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
	}

	.angle-display {
		position: absolute;
		font-size: 0.875rem; line-height: 1.25rem;
		font-weight: 600;
		border-radius: 0.25rem;
		padding-left: 0.5rem; padding-right: 0.5rem;
		background-color: rgba(0, 0, 0, 0.7);
		color: white;
	}

	.slider-dots {
		display: flex;
		width: 100%;
		justify-content: space-between;
		/* @apply px-1; */
	}

	.dot {
		border-radius: 9999px;
		/* @apply transition-all duration-200; */
		background-color: rgb(var(--color-surface-400) / 1);
	}

	:global(.dark) .dot {
		background-color: rgb(var(--color-surface-600) / 1);
	}

	.dot.active {
		/* @apply h-2 w-2; */
		background-color: rgb(var(--color-primary-500) / 1);
	}

	.dot:hover {
		/* @apply scale-125; */
		background-color: rgb(var(--color-primary-400) / 1);
	}

	.mode-tabs {
		display: flex;
		gap: 0.5rem;
	}

	.mode-tab {
		border-radius: 9999px;
		padding-left: 1rem; padding-right: 1rem;
		padding-top: 0.5rem; padding-bottom: 0.5rem;
		font-size: 0.875rem; line-height: 1.25rem;
		font-weight: 500;
		/* @apply transition-all duration-200; */
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
