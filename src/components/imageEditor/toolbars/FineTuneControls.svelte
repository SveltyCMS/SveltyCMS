<!--
@file: src/components/imageEditor/toolbars/FineTuneControls.svelte
@component
Controls for the FineTune tool, including a dropdown for adjustment type and a slider.
-->
<script lang="ts">
	import type { Adjustments } from '@src/components/imageEditor/widgets/FineTune/adjustments';

	const {
		activeAdjustment,
		value,
		onChange,
		onAdjustmentChange,
		onReset,
		onApply
	}: {
		activeAdjustment: keyof Adjustments;
		value: number;
		onChange: (value: number) => void;
		onAdjustmentChange: (key: keyof Adjustments) => void;
		onReset: () => void;
		onApply: () => void;
	} = $props();

	const adjustments: { key: keyof Adjustments; label: string; icon: string }[] = [
		{ key: 'brightness', label: 'Brightness', icon: 'mdi:brightness-6' },
		{ key: 'contrast', label: 'Contrast', icon: 'mdi:contrast-box' },
		{ key: 'saturation', label: 'Saturation', icon: 'mdi:palette' },
		{ key: 'exposure', label: 'Exposure', icon: 'mdi:brightness-7' },
		{ key: 'highlights', label: 'Highlights', icon: 'mdi:white-balance-sunny' },
		{ key: 'shadows', label: 'Shadows', icon: 'mdi:weather-night' },
		{ key: 'temperature', label: 'Temperature', icon: 'mdi:thermometer' },
		{ key: 'clarity', label: 'Clarity', icon: 'mdi:crystal-ball' },
		{ key: 'vibrance', label: 'Vibrance', icon: 'mdi:vibrate' }
	];

	function handleSliderInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onChange(parseInt(target.value, 10));
	}
</script>

<div class="flex w-full items-center gap-4">
	<!-- Adjustment Selector -->
	<select
		class="select select-sm"
		value={activeAdjustment}
		onchange={(e) => onAdjustmentChange((e.currentTarget as HTMLSelectElement).value as keyof Adjustments)}
	>
		{#each adjustments as adj}
			<option value={adj.key}>{adj.label}</option>
		{/each}
	</select>

	<!-- Slider -->
	<div class="flex-1">
		<input type="range" min="-100" max="100" step="1" {value} oninput={handleSliderInput} class="range range-primary" />
	</div>

	<!-- Value & Reset -->
	<div class="flex w-20 items-center justify-end gap-2">
		<span class="text-sm font-medium">{value}</span>
		<button onclick={onReset} class="btn-icon btn-icon-sm preset-ghost-surface-500" title="Reset this adjustment">
			<iconify-icon icon="mdi:restore"></iconify-icon>
		</button>
	</div>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<!-- Apply -->
	<button class="btn preset-filled-success-500" onclick={onApply}>
		<iconify-icon icon="mdi:check"></iconify-icon>
		<span>Apply</span>
	</button>
</div>
