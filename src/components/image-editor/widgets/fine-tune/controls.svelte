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

<div class="editor-dock finetune-controls" role="toolbar" aria-label="Fine-tune controls">
	{#if onCategoryChange}
		<div class="dock-row dock-row-scroll finetune-category-row" role="tablist" aria-label="Adjustment categories">
			<div class="dock-pill-group finetune-category-group">
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
			</div>

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
		<div class="dock-row dock-row-scroll finetune-preset-row">
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

	<div class="dock-row dock-row-scroll finetune-main-row" role="group" aria-label="Adjustments">
		<div class="dock-pill-group finetune-adjust-group">
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

		<div class="finetune-slider-wrap">
			<div class="slider-track finetune-slider-track">
				<div class="finetune-center-tick" aria-hidden="true"></div>
				<input
					type="range"
					{min}
					{max}
					{step}
					{value}
					oninput={handleSliderInput}
					class="slider-input finetune-slider-input"
					style:background={sliderFillStyle}
					aria-label="{config?.label ?? 'Adjustment'} slider"
					aria-valuemin={min}
					aria-valuemax={max}
					aria-valuenow={value}
				/>
			</div>
		</div>

		<div class="dock-pill-group finetune-reset-group">
			<button
				type="button"
				class="dock-pill dock-pill-icon"
				onclick={onReset}
				disabled={value === 0}
				title="Reset to 0"
				aria-label="Reset adjustment"
			>
				<iconify-icon icon="mdi:restore" width="15" aria-hidden="true"></iconify-icon>
			</button>
		</div>

		<div class="dock-pill-group finetune-value-group">
			<span class="finetune-value" class:finetune-value-changed={value !== 0} aria-live="polite">{displayValue}</span>
		</div>
	</div>
</div>

<style>
	@import '../../editor-dock.css';

	.finetune-controls {
		gap: 0.375rem;
	}

	.finetune-category-row,
	.finetune-main-row,
	.finetune-preset-row {
		gap: 0.375rem;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding-inline: 0.125rem;
	}

	.finetune-category-group,
	.finetune-adjust-group {
		flex-shrink: 0;
	}

	.finetune-slider-wrap {
		display: flex;
		flex: 1 1 7rem;
		align-items: center;
		justify-content: center;
		min-width: 6rem;
		max-width: 14rem;
		margin-inline: 0.125rem;
	}

	.finetune-slider-track {
		position: relative;
		width: 100%;
	}

	.finetune-center-tick {
		position: absolute;
		top: 50%;
		left: 50%;
		z-index: 1;
		width: 1.5px;
		height: 0.625rem;
		pointer-events: none;
		background: rgba(255, 255, 255, 0.45);
		border-radius: 1px;
		transform: translate(-50%, -50%);
	}

	.finetune-slider-input {
		position: relative;
		z-index: 2;
		width: 100%;
	}

	.finetune-slider-input::-webkit-slider-thumb {
		background: var(--editor-accent-hover, #ffd43b);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
	}

	.finetune-slider-input::-moz-range-thumb {
		background: var(--editor-accent-hover, #ffd43b);
		border-color: rgba(0, 0, 0, 0.15);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
	}

	.dock-pill-icon {
		justify-content: center;
		width: 1.75rem;
		padding-inline: 0;
	}

	.finetune-reset-group,
	.finetune-value-group {
		flex-shrink: 0;
		justify-content: center;
		padding-inline: 0.125rem;
	}

	.finetune-value-group {
		padding-inline: 0.5rem;
	}

	.finetune-value {
		min-width: 2rem;
		font-size: 0.6875rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		line-height: 1.75rem;
		color: var(--editor-chrome-text, rgba(255, 255, 255, 0.55));
		text-align: center;
	}

	.finetune-value-changed {
		color: var(--editor-chrome-text-hover, rgba(255, 255, 255, 0.92));
	}

	@media (max-width: 1024px) {
		.finetune-main-row {
			justify-content: flex-start;
		}

		.finetune-slider-wrap {
			flex-basis: 100%;
			order: 2;
			max-width: none;
			margin-inline: 0;
		}

		.finetune-reset-group {
			order: 3;
		}

		.finetune-value-group {
			order: 4;
		}
	}
</style>
