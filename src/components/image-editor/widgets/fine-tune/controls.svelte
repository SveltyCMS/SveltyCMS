<!--
@file: src/components/image-editor/widgets/fine-tune/controls.svelte
@component
Pintura-style fine-tune bottom dock — compact pills, no card chrome, full-width scroll.
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

<div class="editor-dock finetune-controls" role="toolbar" aria-label="Fine-tune controls">
	{#if onCategoryChange}
		<div class="dock-row dock-row-scroll" role="tablist" aria-label="Adjustment categories">
			{#each categories as cat (cat)}
				<button
					type="button"
					class="dock-pill"
					class:dock-pill-active={activeCategory === cat}
					onclick={() => onCategoryChange(cat as 'basic' | 'tone' | 'color' | 'detail')}
					role="tab"
					aria-selected={activeCategory === cat}
					title={cat.charAt(0).toUpperCase() + cat.slice(1)}
				>
					<iconify-icon icon={categoryIcons[cat]} width="15" aria-hidden="true"></iconify-icon>
					<span class="capitalize">{cat}</span>
				</button>
			{/each}

			{#if showPresets && onPresetApply}
				<button
					type="button"
					class="dock-pill"
					class:dock-pill-active={showPresetsPanel}
					onclick={() => (showPresetsPanel = !showPresetsPanel)}
					title="Presets"
				>
					<iconify-icon icon="mdi:magic-staff" width="15" aria-hidden="true"></iconify-icon>
					<span>Presets</span>
				</button>
			{/if}

			{#if onAutoAdjust}
				<button type="button" class="dock-pill" onclick={onAutoAdjust} title="Auto adjust (Shift+A)">
					<iconify-icon icon="mdi:auto-fix" width="15" aria-hidden="true"></iconify-icon>
					<span>Auto</span>
				</button>
			{/if}

			{#if onCompareToggle}
				<button
					type="button"
					class="dock-pill"
					class:dock-pill-active={isComparing}
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
		<div class="dock-row dock-row-scroll">
			{#each FILTER_PRESETS as preset (preset.name)}
				<button
					type="button"
					class="dock-pill"
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

	<div class="dock-row dock-row-scroll" role="group" aria-label="Adjustments">
		{#each getAdjustmentsByCategory(activeCategory as 'basic' | 'tone' | 'color' | 'detail') as adj (adj.key)}
			{@const adjConfig = getAdjustmentConfig(adj.key)}
			{@const hasChange = (adjustments?.[adj.key] ?? 0) !== 0}
			<button
				type="button"
				class="dock-pill"
				class:dock-pill-active={activeAdjustment === adj.key}
				class:dock-pill-changed={hasChange}
				onclick={() => onAdjustmentChange(adj.key)}
				title={adjConfig?.description || adj.label}
				aria-label="Adjust {adj.label}"
				aria-pressed={activeAdjustment === adj.key}
			>
				<iconify-icon icon={adj.icon} width="15" aria-hidden="true"></iconify-icon>
				<span>{adj.label}</span>
				{#if hasChange}
					<span class="dock-pill-badge">{(adjustments?.[adj.key] ?? 0) > 0 ? '+' : ''}{adjustments?.[adj.key] ?? 0}</span>
				{/if}
			</button>
		{/each}
	</div>

	<div class="slider-block">
		<div class="slider-header">
			<span class="slider-label">{config?.label || 'Adjustment'}</span>
			<button
				type="button"
				class="dock-icon-btn"
				onclick={onReset}
				disabled={value === 0}
				title="Reset to 0"
				aria-label="Reset adjustment"
			>
				<iconify-icon icon="mdi:restore" width="16" aria-hidden="true"></iconify-icon>
			</button>
		</div>
		<div class="slider-track">
			<input
				type="range"
				min={config?.min || -100}
				max={config?.max || 100}
				step={config?.step || 1}
				{value}
				oninput={handleSliderInput}
				class="slider-input"
				aria-label="{config?.label} adjustment"
			/>
			<span class="slider-value" class:slider-value-changed={value !== 0}>{value > 0 ? '+' : ''}{value}</span>
		</div>
	</div>
</div>

<style>
	@import '../../editor-dock.css';
</style>
