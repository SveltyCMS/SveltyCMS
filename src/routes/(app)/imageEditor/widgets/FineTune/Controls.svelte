<!--
@file: src/routes/(app)/imageEditor/widgets/FineTune/Controls.svelte
@component
**Fine-Tune tool controls for master toolbar**
(Stateless UI component, styled to match other widgets)
-->
<script lang="ts">
	import { ADJUSTMENT_OPTIONS, type Adjustments } from './adjustments';

	let {
		activeAdjustment,
		value = 0,
		onChange,
		onAdjustmentChange,
		onReset,
		onApply,
		onComparisonStart,
		onComparisonEnd
	}: {
		activeAdjustment: keyof Adjustments;
		value: number;
		onChange: (v: number) => void;
		onAdjustmentChange: (v: keyof Adjustments) => void;
		onReset: () => void;
		onApply: () => void;
		onComparisonStart: () => void;
		onComparisonEnd: () => void;
	} = $props();

	// Local binding for the slider
	let sliderValue = $derived(value);
</script>

<div class="finetune-controls">
	<!-- Adjustment Selector -->
	<select
		class="select-input"
		bind:value={activeAdjustment}
		onchange={(e) => onAdjustmentChange(e.currentTarget.value as keyof Adjustments)}
		aria-label="Select adjustment"
	>
		{#each ADJUSTMENT_OPTIONS as o}
			<option value={o.key}>{o.label}</option>
		{/each}
	</select>
	<div class="divider"></div>

	<!-- Slider -->
	<span class="value">{sliderValue}</span>
	<input
		type="range"
		min="-100"
		max="100"
		step="1"
		bind:value={sliderValue}
		oninput={(e) => onChange(parseInt(e.currentTarget.value))}
		class="slider"
	/>

	<div class="divider-grow"></div>

	<!-- Actions -->
	<button class="btn-tool" onmousedown={onComparisonStart} onmouseup={onComparisonEnd} onmouseleave={onComparisonEnd}>
		<iconify-icon icon="mdi:compare" width="20"></iconify-icon>
		<span>Compare</span>
	</button>
	<button class="btn-tool" onclick={onReset}>
		<iconify-icon icon="mdi:restore" width="18"></iconify-icon>
		<span>Reset</span>
	</button>
	<button class="btn-apply" onclick={onApply}>
		<iconify-icon icon="mdi:check" width="18"></iconify-icon>
		<span>Apply</span>
	</button>
</div>

<style lang="postcss">
	@import "tailwindcss";
	.finetune-controls {
		@apply flex w-full items-center gap-3 px-2;
	}
	.select-input {
		rounded-md border border-surface-300 bg-white px-2 py-1.5 text-sm; border-color: var(--color-surface-600); background-color: var(--color-surface-800);
	}
	.slider {
		@apply h-2 w-48 cursor-pointer appearance-none rounded-full ; background-color: var(--color-surface-600);
	}
	.slider::-webkit-slider-thumb {
		@apply h-4 w-4 appearance-none rounded-full  shadow-md; background-color: var(--color-primary-600);
	}
	.slider::-moz-range-thumb {
		@apply h-4 w-4 rounded-full border-0  shadow-md; background-color: var(--color-primary-600);
	}
	.value {
		@apply min-w-[2.5rem] text-right text-sm font-semibold ; color: var(--color-surface-200);
	}
	.divider {
		@apply h-6 w-px ; background-color: var(--color-surface-600);
	}
	.divider-grow {
		@apply flex-grow;
	}
	.btn-tool {
		@apply flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors;
		bg-surface-200 text-surface-700; background-color: var(--color-surface-700); color: var(--color-surface-200);
	}
	.btn-tool:hover {
		 background-color: var(--color-surface-600);
	}
	.btn-apply {
		@apply flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-white;
		 background-color: var(--color-success-600);
	}
</style>
