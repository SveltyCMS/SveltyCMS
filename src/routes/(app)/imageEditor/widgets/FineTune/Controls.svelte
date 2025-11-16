<!--
@file src/routes/(app)/imageEditor/components/toolbars/controls/FineTuneControls.svelte
@component
Controls for FineTune tool rendered inside the Master Toolbar.

### Props:
- activeAdjustment: keyof Adjustments
- value: number (current adjustment value)
- onChange: (value: number) => void
- onAdjustmentChange: (adj: string) => void
- onReset: () => void
- onApply: () => void
- onComparisonStart: () => void
- onComparisonEnd: () => void
-->

<script lang="ts">
	let {
		activeAdjustment,
		value = 0,
		onChange = () => {},
		onAdjustmentChange = () => {},
		onReset = () => {},
		onApply = () => {},
		onComparisonStart = () => {},
		onComparisonEnd = () => {}
	} = $props<{
		activeAdjustment: string;
		value?: number;
		onChange?: (v: number) => void;
		onAdjustmentChange?: (adj: string) => void;
		onReset?: () => void;
		onApply?: () => void;
		onComparisonStart?: () => void;
		onComparisonEnd?: () => void;
	}>();

	const options = [
		{ key: 'brightness', label: 'Brightness' },
		{ key: 'contrast', label: 'Contrast' },
		{ key: 'saturation', label: 'Saturation' },
		{ key: 'temperature', label: 'Temperature' },
		{ key: 'exposure', label: 'Exposure' },
		{ key: 'highlights', label: 'Highlights' },
		{ key: 'shadows', label: 'Shadows' },
		{ key: 'clarity', label: 'Clarity' },
		{ key: 'vibrance', label: 'Vibrance' }
	];
</script>

<div class="finetune-controls flex items-center gap-2">
	<select
		class="select rounded border px-2 py-1 text-sm"
		bind:value={activeAdjustment}
		onchange={(e) => onAdjustmentChange((e.target as HTMLSelectElement).value)}
	>
		{#each options as o}
			<option value={o.key} selected={o.key === activeAdjustment}>{o.label}</option>
		{/each}
	</select>

	<div class="slider-wrap flex items-center gap-2">
		<input type="range" min="-100" max="100" step="1" bind:value oninput={(e) => onChange(parseInt((e.target as HTMLInputElement).value))} />
		<span class="val text-xs text-surface-600 dark:text-surface-300">{value}</span>
	</div>

	<button
		class="control-btn rounded bg-surface-200 px-3 py-1.5 text-sm dark:bg-surface-700"
		onmousedown={onComparisonStart}
		onmouseup={onComparisonEnd}
		title="Hold to compare">Compare</button
	>
	<div class="divider h-6 w-px bg-surface-300 dark:bg-surface-600"></div>
	<button class="control-btn rounded bg-surface-200 px-3 py-1.5 text-sm dark:bg-surface-700" onclick={onReset}>Reset</button>
	<button class="apply-btn rounded px-3 py-1.5 text-sm text-white" onclick={onApply}>Apply</button>
</div>

<style lang="postcss">
	.apply-btn {
		background-color: rgb(var(--color-success-500) / 1);
	}
</style>
