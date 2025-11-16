<!--
@file src/routes/(app)/imageEditor/components/toolbars/controls/BlurControls.svelte
@component
**Blur tool controls for master toolbar**

### Props
- `blurStrength`: Current blur strength value
- `onBlurStrengthChange`: Function called when blur strength changes
- `onAddRegion`: Function called when add region button is clicked
- `onReset`: Function called when reset button is clicked
- `onApply`: Function called when apply button is clicked

### Features:
- Slider for adjusting blur strength
- Add Region button for multiple blur areas
- Reset and Apply buttons

-->

<script lang="ts">
	let {
		blurStrength,
		onBlurStrengthChange,
		onAddRegion,
		onReset,
		onApply
	}: {
		blurStrength: number;
		onBlurStrengthChange: (value: number) => void;
		onAddRegion: () => void;
		onReset: () => void;
		onApply: () => void;
	} = $props();
</script>

<div class="blur-controls">
	<button onclick={onAddRegion} class="add-btn" title="Add new blur region">
		<iconify-icon icon="mdi:plus-circle-outline" width="20"></iconify-icon>
		Add Region
	</button>

	<div class="divider"></div>

	<span class="label">Blur Strength:</span>
	<input type="range" min="1" max="50" value={blurStrength} oninput={(e) => onBlurStrengthChange(parseInt(e.currentTarget.value))} class="slider" />
	<span class="value">{blurStrength}</span>

	<div class="divider"></div>

	<button onclick={onReset} class="control-btn">
		<iconify-icon icon="mdi:restore" width="18"></iconify-icon>
		Reset
	</button>

	<button onclick={onApply} class="apply-btn">
		<iconify-icon icon="mdi:check" width="18"></iconify-icon>
		Apply
	</button>
</div>

<style lang="postcss">
	.blur-controls {
		@apply flex items-center gap-3;
	}

	.add-btn {
		@apply flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors;
		background-color: rgb(var(--color-primary-500) / 1);
		color: white;
	}

	.add-btn:hover {
		background-color: rgb(var(--color-primary-600) / 1);
	}

	.label {
		@apply text-sm font-medium;
		color: rgb(var(--color-surface-700) / 1);
	}

	:global(.dark) .label {
		color: rgb(var(--color-surface-200) / 1);
	}

	.slider {
		@apply h-2 w-32 cursor-pointer appearance-none rounded-full;
		background: linear-gradient(to right, rgb(var(--color-primary-300) / 1), rgb(var(--color-primary-600) / 1));
	}

	.slider::-webkit-slider-thumb {
		@apply h-4 w-4 appearance-none rounded-full bg-white shadow-md;
	}

	.slider::-moz-range-thumb {
		@apply h-4 w-4 rounded-full border-0 bg-white shadow-md;
	}

	.value {
		@apply min-w-[2rem] text-center text-sm font-semibold;
		color: rgb(var(--color-surface-700) / 1);
	}

	:global(.dark) .value {
		color: rgb(var(--color-surface-200) / 1);
	}

	.control-btn {
		@apply flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors;
		background-color: rgb(var(--color-surface-200) / 1);
		color: rgb(var(--color-surface-700) / 1);
	}

	:global(.dark) .control-btn {
		background-color: rgb(var(--color-surface-700) / 1);
		color: rgb(var(--color-surface-200) / 1);
	}

	.control-btn:hover {
		background-color: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .control-btn:hover {
		background-color: rgb(var(--color-surface-600) / 1);
	}

	.apply-btn {
		@apply flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium;
		background-color: rgb(var(--color-success-500) / 1);
		color: white;
	}

	.apply-btn:hover {
		background-color: rgb(var(--color-success-600) / 1);
	}

	.divider {
		@apply h-6 w-px;
		background-color: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .divider {
		background-color: rgb(var(--color-surface-600) / 1);
	}
</style>
