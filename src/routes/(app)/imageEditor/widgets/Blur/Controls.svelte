<!--
@file src/routes/(app)/imageEditor/widgets/Blur/Controls.svelte
@component
**Blur tool controls for master toolbar**
Supports strength, shapes (rect, ellipse), and patterns (blur, pixelate).
-->

<script lang="ts">
	import type { BlurPattern, BlurShape } from './regions';

	// Props are passed from Tool.svelte via imageEditorStore.setToolbarControls
	const {
		blurStrength,
		shape,
		pattern,
		onStrengthChange,
		onShapeChange,
		onPatternChange,
		onAddRegion,
		onReset,
		onApply
	}: {
		blurStrength: number;
		shape: BlurShape;
		pattern: BlurPattern;
		onStrengthChange: (value: number) => void;
		onShapeChange: (value: BlurShape) => void;
		onPatternChange: (value: BlurPattern) => void;
		onAddRegion: () => void;
		onReset: () => void;
		onApply: () => void;
	} = $props();

	function handleStrengthInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onStrengthChange(parseInt(target.value, 10));
	}

	// Bind value for slider
	let sliderValue = $derived(blurStrength);
</script>

<div class="blur-controls">
	<!-- Add Region -->
	<button onclick={onAddRegion} class="btn-tool" title="Add new blur region">
		<iconify-icon icon="mdi:plus-circle-outline" width="20"></iconify-icon>
		<span>Add Region</span>
	</button>
	<div class="divider"></div>

	<!-- Shape Selector -->
	<span class="label">Shape:</span>
	<div class="segment-group">
		<button
			class="segment-btn"
			class:active={shape === 'rectangle'}
			onclick={() => onShapeChange('rectangle')}
			aria-pressed={shape === 'rectangle'}
			title="Rectangular blur"
		>
			<iconify-icon icon="mdi:crop-square" width="20"></iconify-icon>
		</button>
		<button
			class="segment-btn"
			class:active={shape === 'ellipse'}
			onclick={() => onShapeChange('ellipse')}
			aria-pressed={shape === 'ellipse'}
			title="Elliptical/Circular blur"
		>
			<iconify-icon icon="mdi:circle-outline" width="20"></iconify-icon>
		</button>
	</div>
	<div class="divider"></div>

	<!-- Pattern Selector -->
	<span class="label">Pattern:</span>
	<div class="segment-group">
		<button
			class="segment-btn"
			class:active={pattern === 'blur'}
			onclick={() => onPatternChange('blur')}
			aria-pressed={pattern === 'blur'}
			title="Gaussian blur"
		>
			<iconify-icon icon="mdi:blur" width="20"></iconify-icon>
		</button>
		<button
			class="segment-btn"
			class:active={pattern === 'pixelate'}
			onclick={() => onPatternChange('pixelate')}
			aria-pressed={pattern === 'pixelate'}
			title="Pixelate"
		>
			<iconify-icon icon="mdi:grid" width="20"></iconify-icon>
		</button>
	</div>
	<div class="divider"></div>

	<!-- Strength Slider -->
	<span class="label">{pattern === 'pixelate' ? 'Pixel Size:' : 'Strength:'}</span>
	<input
		type="range"
		min="5"
		max={pattern === 'pixelate' ? 50 : 100}
		step="1"
		bind:value={sliderValue}
		oninput={handleStrengthInput}
		class="slider"
	/>
	<span class="value">{sliderValue}</span>

	<div class="divider-grow"></div>

	<!-- Actions -->
	<button onclick={onReset} class="btn-tool" title="Reset all blur regions">
		<iconify-icon icon="mdi:restore" width="18"></iconify-icon>
		<span>Reset</span>
	</button>
	<button onclick={onApply} class="btn-apply" title="Apply blur effects">
		<iconify-icon icon="mdi:check" width="18"></iconify-icon>
		<span>Apply</span>
	</button>
</div>

<style lang="postcss">
	@reference "../../../../../app.css";
	.blur-controls {
		@apply flex w-full items-center gap-3 px-2;
	}

	.label {
		@apply text-nowrap text-sm font-medium text-surface-700 dark:text-surface-200;
	}

	.slider {
		@apply h-2 w-32 cursor-pointer appearance-none rounded-full bg-surface-300 dark:bg-surface-600;
	}
	.slider::-webkit-slider-thumb {
		@apply h-4 w-4 appearance-none rounded-full bg-primary-600 shadow-md;
	}
	.slider::-moz-range-thumb {
		@apply h-4 w-4 rounded-full border-0 bg-primary-600 shadow-md;
	}

	.value {
		@apply min-w-[2rem] text-center text-sm font-semibold text-surface-700 dark:text-surface-200;
	}

	.divider {
		@apply h-6 w-px bg-surface-300 dark:bg-surface-600;
	}
	.divider-grow {
		@apply flex-grow;
	}

	.btn-tool {
		@apply flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors;
		@apply bg-surface-200 text-surface-700 dark:bg-surface-700 dark:text-surface-200;
	}
	.btn-tool:hover {
		@apply bg-surface-300 dark:bg-surface-600;
	}

	.btn-apply {
		@apply flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-white;
		@apply bg-success-500 hover:bg-success-600;
	}

	/* Segmented Control */
	.segment-group {
		@apply flex items-center rounded-lg bg-surface-200 p-0.5 dark:bg-surface-700;
	}
	.segment-btn {
		@apply rounded-md px-2 py-1 transition-colors;
		@apply text-surface-500 dark:text-surface-400;
	}
	.segment-btn:hover:not(.active) {
		@apply text-surface-700 dark:text-surface-200;
	}
	.segment-btn.active {
		@apply bg-white text-primary-600 shadow-sm dark:bg-surface-900;
	}
</style>


