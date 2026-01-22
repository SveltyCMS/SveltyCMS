<!--
@file: src/components/imageEditor/toolbars/FineTuneControls.svelte
@component
Controls for the FineTune tool, including a dropdown for adjustment type and a slider.
-->
<script lang="ts">
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
	import X from '@lucide/svelte/icons/x';

	// Using iconify-icon web component
	import type { Adjustments } from '@src/components/imageEditor/widgets/FineTune/adjustments';

	const {
		activeAdjustment,
		value,
		onChange,
		onAdjustmentChange,
		onReset,
		onCancel,
		onApply
	}: {
		activeAdjustment: keyof Adjustments;
		value: number;
		onChange: (value: number) => void;
		onAdjustmentChange: (key: keyof Adjustments) => void;
		onReset: () => void;
		onCancel: () => void;
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
	<!-- Adjustment Selector (Horizontal Scroll) -->
	<div class="flex-1 overflow-x-auto no-scrollbar py-1">
		<div class="flex items-center gap-1 min-w-max px-2">
			{#each adjustments as adj}
				<button
					class="btn-sm preset-outlined-surface-500flex flex-col items-center gap-1 w-20 h-14"
					class:preset-filled-primary-500={activeAdjustment === adj.key}
					onclick={() => onAdjustmentChange(adj.key)}
					title={adj.label}
				>
					{#if adj.icon as keyof typeof iconsData}<Icon
							icon={adj.icon as keyof typeof iconsData}
							size={18}
						/>{/if}
					<span class="text-[10px] uppercase tracking-tighter leading-none">{adj.label}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Slider -->
	<div class="w-48 px-2 flex flex-col gap-1">
		<div class="flex justify-between text-[10px] text-surface-500 uppercase font-bold">
			<span>{adjustments.find((a) => a.key === activeAdjustment)?.label}</span>
			<span class={value !== 0 ? 'text-primary-500' : ''}>{value}</span>
		</div>
		<input type="range" min="-100" max="100" step="1" {value} oninput={handleSliderInput} class="range range-primary range-sm" />
	</div>

	<!-- Reset -->
	<button onclick={onReset} class="btn-sm btn-icon preset-outlined-surface-500" title="Reset this adjustment" disabled={value === 0}>
		<CircleQuestionMark size={24} />
	</button>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<!-- Cancel -->
	<button class="btn preset-outlined-error-500" onclick={onCancel}>
		<X />
		<span>Cancel</span>
	</button>

	<!-- Apply -->
	<button class="btn preset-filled-success-500" onclick={onApply}>
		<Check />
		<span>Apply</span>
	</button>
</div>

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
