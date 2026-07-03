<!--
@file: src/components/image-editor/widgets/fine-tune/controls.svelte
@component
Pintura-style fine-tune dock — compact pills, inline accent slider, aligned rows.
-->
<script lang="ts">
	import type { Adjustments } from './adjustments';
	import {
		FILTER_PRESETS,
		getAdjustmentConfig,
		getAdjustmentsByCategory,
	} from './adjustments';

	const {
		activeAdjustment,
		activeCategory = 'basic',
		value,
		adjustments,
		showPresets = false,
		isComparing = false,
		onChange,
		onAdjustmentChange,
		onCategoryChange,
		onPresetApply,
		onReset,
		onCompareToggle,
		onAutoAdjust,
	}: {
		activeAdjustment: keyof Adjustments;
		activeCategory?: string;
		value: number;
		adjustments?: Adjustments;
		showPresets?: boolean;
		isComparing?: boolean;
		onChange: (value: number) => void;
		onAdjustmentChange: (key: keyof Adjustments) => void;
		onCategoryChange?: (category: string) => void;
		onPresetApply?: (preset: string) => void;
		onReset: () => void;
		onCompareToggle?: () => void;
		onAutoAdjust?: () => void;
	} = $props();

	const config = $derived(getAdjustmentConfig(activeAdjustment));
	const categories = ['basic', 'tone', 'color', 'detail'] as const;
	const categoryIcons = {
		basic: 'mdi:tune-variant',
		tone: 'mdi:gradient-vertical',
		color: 'mdi:palette',
		detail: 'mdi:details',
	};

	let showPresetsPanel = $state(false);

	const min = $derived(config?.min ?? -100);
	const max = $derived(config?.max ?? 100);
	const step = $derived(config?.step ?? 1);
	const sliderProgress = $derived((value - min) / (max - min));
	const centerProgress = $derived(((0 - min) / (max - min)) * 100);
	const displayValue = $derived(value > 0 ? `+${value}` : `${value}`);

	const sliderFillStyle = $derived.by(() => {
		const thumb = sliderProgress * 100;
		const center = centerProgress;
		const accent = 'var(--editor-accent, #f5c518)';
		const track = 'rgba(255, 255, 255, 0.16)';

		if (Math.abs(value) < 0.5) {
			return `linear-gradient(to right, ${track} 0%, ${track} 100%)`;
		}

		if (value > 0) {
			return `linear-gradient(to right, ${track} 0%, ${track} ${center}%, ${accent} ${center}%, ${accent} ${thumb}%, ${track} ${thumb}%, ${track} 100%)`;
		}

		return `linear-gradient(to right, ${track} 0%, ${track} ${thumb}%, ${accent} ${thumb}%, ${accent} ${center}%, ${track} ${center}%, ${track} 100%)`;
	});

	function handleSliderInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onChange(Number.parseInt(target.value, 10));
	}

	function handleKeyDown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).tagName === 'INPUT') return;

		switch (e.key) {
			case '0':
				e.preventDefault();
				onReset();
				break;
			case 'c':
			case 'C':
				if (onCompareToggle) {
					e.preventDefault();
					onCompareToggle();
				}
				break;
			case 'a':
			case 'A':
				if (e.shiftKey && onAutoAdjust) {
					e.preventDefault();
					onAutoAdjust();
				}
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="flex flex-col flex-[0_0_auto] gap-1.5 items-stretch w-full min-w-0 h-auto leading-none" role="toolbar" aria-label="Fine-tune controls">
	{#if onCategoryChange}
		<div class="flex flex-wrap gap-1.5 items-center justify-center w-full min-w-0 min-h-0 leading-none flex-nowrap overflow-x-auto overflow-y-hidden pb-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full gap-1.5 items-center justify-center w-full px-0.5" role="tablist" aria-label="Adjustment categories">
			<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full shrink-0">
				{#each categories as cat (cat)}
					<button
						type="button"
						class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
						class:text-white={activeCategory === cat}
						onclick={() => onCategoryChange(cat as 'basic' | 'tone' | 'color' | 'detail')}
						role="tab"
						aria-selected={activeCategory === cat}
						title={cat.charAt(0).toUpperCase() + cat.slice(1)}
					>
						<iconify-icon icon={categoryIcons[cat]} width="15" aria-hidden="true"></iconify-icon>
						<span class="capitalize">{cat}</span>
					</button>
				{/each}
			</div>

			{#if showPresets && onPresetApply}
				<button
					type="button"
					class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
					class:text-white={showPresetsPanel}
					onclick={() => (showPresetsPanel = !showPresetsPanel)}
					title="Presets"
				>
					<iconify-icon icon="mdi:magic-staff" width="15" aria-hidden="true"></iconify-icon>
					<span>Presets</span>
				</button>
			{/if}

			{#if onAutoAdjust}
				<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onclick={onAutoAdjust} title="Auto adjust (Shift+A)">
					<iconify-icon icon="mdi:auto-fix" width="15" aria-hidden="true"></iconify-icon>
					<span>Auto</span>
				</button>
			{/if}

			{#if onCompareToggle}
				<button
					type="button"
					class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
					class:text-white={isComparing}
					onclick={onCompareToggle}
					title="Compare (C)"
					aria-pressed={isComparing}
				>
					<iconify-icon icon="mdi:compare" width="15" aria-hidden="true"></iconify-icon>
					<span>Compare</span>
				</button>
			{/if}
		</div>
	{/if}

	{#if showPresetsPanel && onPresetApply}
		<div class="flex flex-wrap gap-1.5 items-center justify-center w-full min-w-0 min-h-0 leading-none flex-nowrap overflow-x-auto overflow-y-hidden pb-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full gap-1.5 items-center justify-center w-full px-0.5">
			{#each FILTER_PRESETS as preset (preset.name)}
				<button
					type="button"
					class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
					onclick={() => {
						onPresetApply(preset.name);
						showPresetsPanel = false;
					}}
					title={preset.description}
					aria-label="Apply {preset.name} preset"
				>
					<iconify-icon icon={preset.icon} width="15" aria-hidden="true"></iconify-icon>
					<span>{preset.name}</span>
				</button>
			{/each}
		</div>
	{/if}

	<div class="flex flex-wrap gap-1.5 items-center justify-center w-full min-w-0 min-h-0 leading-none flex-nowrap overflow-x-auto overflow-y-hidden pb-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full gap-1.5 items-center justify-center w-full px-0.5 max-lg:justify-start" role="group" aria-label="Adjustments">
		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full shrink-0">
			{#each getAdjustmentsByCategory(activeCategory as 'basic' | 'tone' | 'color' | 'detail') as adj (adj.key)}
				{@const adjConfig = getAdjustmentConfig(adj.key)}
				{@const hasChange = (adjustments?.[adj.key] ?? 0) !== 0}
				<button
					type="button"
					class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
					class:text-white={activeAdjustment === adj.key}
					class:text-[rgba(255,255,255,0.85)]={hasChange && activeAdjustment !== adj.key}
					onclick={() => onAdjustmentChange(adj.key)}
					title={adjConfig?.description || adj.label}
					aria-label="Adjust {adj.label}"
					aria-pressed={activeAdjustment === adj.key}
				>
					<iconify-icon icon={adj.icon} width="15" aria-hidden="true"></iconify-icon>
					<span>{adj.label}</span>
					{#if hasChange}
						<span class="text-[9px] font-semibold text-[rgba(255,255,255,0.45)]">{(adjustments?.[adj.key] ?? 0) > 0 ? '+' : ''}{adjustments?.[adj.key] ?? 0}</span>
					{/if}
				</button>
			{/each}
		</div>

		<div class="flex flex-[1_1_7rem] items-center justify-center min-w-24 max-w-56 mx-0.5 max-lg:basis-full max-lg:order-2 max-lg:max-w-none max-lg:mx-0">
			<div class="relative w-full">
				<div class="absolute top-1/2 left-1/2 z-1 w-[1.5px] h-2.5 pointer-events-none bg-white/45 rounded-[1px] -translate-x-1/2 -translate-y-1/2" aria-hidden="true"></div>
				<input aria-label={config?.label ?? 'Adjustment'}
					type="range"
					{min}
					{max}
					{step}
					{value}
					oninput={handleSliderInput}
					class="relative z-2 w-full flex-1 h-1 m-0 appearance-none cursor-pointer bg-white/[0.18] rounded-full [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:bg-[--editor-accent-hover,var(--color-warning-400,#ffd43b)] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:[box-shadow:0_0_0_1px_rgba(0,0,0,0.2)] [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:bg-[--editor-accent-hover,var(--color-warning-400,#ffd43b)] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[rgba(0,0,0,0.15)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:[box-shadow:0_0_0_1px_rgba(0,0,0,0.2)]"
					style:background={sliderFillStyle}
					aria-valuemin={min}
					aria-valuemax={max}
					aria-valuenow={value}
				/>
			</div>
		</div>

		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center justify-center h-auto min-h-0 p-0.5 px-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full shrink-0 max-lg:order-3">
			<button
				type="button"
				class="inline-flex flex-[0_0_auto] gap-1.5 items-center justify-center h-7 w-7 px-0 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
				onclick={onReset}
				disabled={value === 0}
				title="Reset to 0"
				aria-label="Reset adjustment"
			>
				<iconify-icon icon="mdi:restore" width="15" aria-hidden="true"></iconify-icon>
			</button>
		</div>

		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center justify-center h-auto min-h-0 p-0.5 px-2 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full shrink-0 max-lg:order-4">
			<span class="min-w-8 text-[11px] font-medium tabular-nums leading-7 text-center text-[rgba(255,255,255,0.55)]" class:text-[rgba(255,255,255,0.92)]={value !== 0} aria-live="polite">{displayValue}</span>
		</div>
	</div>
</div>
