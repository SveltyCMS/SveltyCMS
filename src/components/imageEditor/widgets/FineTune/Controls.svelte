<!--
@file: src/components/imageEditor/widgets/FineTune/Controls.svelte
@component
Professional fine-tune controls with presets and categories
-->
<script lang="ts">
	import type { Adjustments } from './adjustments';
	import { FILTER_PRESETS, getAdjustmentConfig, getAdjustmentsByCategory } from './adjustments';

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
		onAutoAdjust
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
		detail: 'mdi:details'
	};

	let showPresetsPanel = $state(false);

	function handleSliderInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onChange(parseInt(target.value, 10));
	}

	// Keyboard shortcuts
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

<div class="finetune-controls" role="toolbar" aria-label="Fine-tune controls">
	<!-- Top Row: Categories & Presets -->
	<div class="controls-header">
		<!-- Category Tabs -->
		{#if onCategoryChange}
			<div class="category-tabs" role="tablist">
				{#each categories as cat (cat)}
					<button
						class="category-tab"
						class:active={activeCategory === cat}
						onclick={() => onCategoryChange(cat as 'basic' | 'tone' | 'color' | 'detail')}
						role="tab"
						aria-selected={activeCategory === cat}
						title={cat.charAt(0).toUpperCase() + cat.slice(1)}
					>
						<iconify-icon icon={categoryIcons[cat]} width="18"></iconify-icon>
						<span class="hidden md:inline capitalize">{cat}</span>
					</button>
				{/each}
			</div>
		{/if}

		<!-- Presets Button -->
		{#if showPresets && onPresetApply}
			<button class="btn btn-sm preset-outlined-surface-500" onclick={() => (showPresetsPanel = !showPresetsPanel)}>
				<iconify-icon icon="mdi:magic-staff" width="16"></iconify-icon>
				<span class="hidden sm:inline">Presets</span>
			</button>
		{/if}

		<!-- Auto Adjust -->
		{#if onAutoAdjust}
			<button class="btn btn-sm preset-outlined-primary-500" onclick={onAutoAdjust} title="Auto Adjust (Shift+A)">
				<iconify-icon icon="mdi:auto-fix" width="16"></iconify-icon>
				<span class="hidden sm:inline">Auto</span>
			</button>
		{/if}

		<div class="flex-1"></div>

		<!-- Compare Toggle -->
		{#if onCompareToggle}
			<button
				class="btn btn-sm"
				class:preset-filled-primary-500={isComparing}
				class:preset-outlined-surface-500={!isComparing}
				onclick={onCompareToggle}
				title="Compare before/after (C)"
			>
				<iconify-icon icon="mdi:compare" width="16"></iconify-icon>
				<span class="hidden sm:inline">Compare</span>
			</button>
		{/if}
	</div>

	<!-- Presets Panel (Horizontal Scroll) -->
	{#if showPresetsPanel && onPresetApply}
		<div class="presets-scroll-container">
			{#each FILTER_PRESETS as preset (preset.name)}
				<button
					class="preset-card"
					onclick={() => {
						onPresetApply(preset.name);
						// Don't close panel immediately for quick browsing
					}}
					title={preset.description}
				>
					<div class="preset-icon-wrapper">
						<iconify-icon icon={preset.icon} width="24"></iconify-icon>
					</div>
					<span class="preset-name">{preset.name}</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- Main Controls -->
	<div class="controls-container">
		<!-- Adjustment Selector -->
		<div class="adjustments-scroll">
			<div class="adjustments-grid">
				{#each getAdjustmentsByCategory(activeCategory as 'basic' | 'tone' | 'color' | 'detail') as adj (adj.key)}
					{@const adjConfig = getAdjustmentConfig(adj.key)}
					{@const hasChange = (adjustments?.[adj.key] ?? 0) !== 0}
					<button
						class="adjustment-btn"
						class:active={activeAdjustment === adj.key}
						class:has-change={hasChange}
						onclick={() => onAdjustmentChange(adj.key)}
						title={adjConfig?.description || adj.label}
					>
						<iconify-icon icon={adj.icon} width="24"></iconify-icon>
						<span class="adjustment-label">{adj.label}</span>
						{#if hasChange}
							<span class="change-indicator">{(adjustments?.[adj.key] ?? 0) > 0 ? '+' : ''}{adjustments?.[adj.key] ?? 0}</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>

		<!-- Slider Section -->
		<div class="slider-section">
			<div class="slider-title">
				<span>{config?.label || 'Adjustment'}</span>
				<div class="flex gap-2">
					<button class="btn btn-icon btn-sm preset-outlined-surface-500" onclick={onReset} disabled={value === 0} title="Reset to 0">
						<iconify-icon icon="mdi:restore" width="16"></iconify-icon>
					</button>
				</div>
			</div>

			<div class="slider-wrapper">
				<div class="slider-track-container">
					<div class="center-tick"></div>
					<input
						type="range"
						min={config?.min || -100}
						max={config?.max || 100}
						step={config?.step || 1}
						{value}
						oninput={handleSliderInput}
						class="slider"
						aria-label="{config?.label} adjustment"
					/>
				</div>
				<div class="slider-value" class:changed={value !== 0}>
					{value > 0 ? '+' : ''}{value}
				</div>
			</div>
		</div>
	</div>

	<!-- Actions -->
	<!-- Footer removed: Actions are handled by global toolbar or live updates -->
	<div class="h-2"></div>
</div>

<style>
	.finetune-controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 0;
		background: transparent;
		border: none;
		width: 100%;
	}

	/* Header */
	.controls-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.category-tabs {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 9999px;
		flex-wrap: nowrap;
		overflow-x: auto;
	}

	.category-tab {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.375rem 1rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
		color: #9ca3af;
		transition: all 0.2s;
		background: transparent;
		border: none;
		white-space: nowrap;
	}

	.category-tab:hover {
		color: white;
		background: rgba(255, 255, 255, 0.05);
	}

	.category-tab.active {
		background: #3b82f6; /* Primary-500 */
		color: white;
		box-shadow:
			0 4px 6px -1px rgba(0, 0, 0, 0.1),
			0 2px 4px -1px rgba(0, 0, 0, 0.06);
	}

	/* Controls Container */
	.controls-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	@media (min-width: 1024px) {
		.controls-container {
			flex-direction: row;
			align-items: flex-start;
		}
	}

	/* Adjustments Grid/Scroll */
	.adjustments-scroll {
		flex: 1;
		width: 100%;
		overflow-x: auto;
		padding-bottom: 0.25rem;
	}

	.adjustments-grid {
		display: flex;
		gap: 0.5rem;
		min-width: max-content;
	}

	.adjustment-btn {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		min-width: 72px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.03);
		cursor: pointer;
		transition: all 0.2s;
		color: #9ca3af;
	}

	.adjustment-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		color: white;
		transform: translateY(-2px);
	}

	.adjustment-btn.active {
		background: rgba(59, 130, 246, 0.2); /* Primary with opacity */
		border-color: #3b82f6;
		color: #60a5fa;
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
	}

	.adjustment-btn.has-change {
		border-color: rgb(var(--color-primary-500) / 0.5);
	}

	.adjustment-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-align: center;
		line-height: 1.2;
		color: rgb(var(--color-surface-700) / 1);
	}

	:global(.dark) .adjustment-label {
		color: rgb(var(--color-surface-300) / 1);
	}

	.change-indicator {
		position: absolute;
		top: 0.25rem;
		right: 0.25rem;
		font-size: 0.65rem;
		font-weight: 700;
		color: rgb(var(--color-primary-600) / 1);
		background: rgb(var(--color-primary-100) / 1);
		padding: 0 0.25rem;
		border-radius: 0.25rem;
		min-width: 1.25rem;
		text-align: center;
	}

	/* Slider Section - Enhanced */
	.slider-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
		flex-shrink: 0;
	}

	@media (min-width: 1024px) {
		.slider-section {
			width: 300px;
		}
	}

	.slider-wrapper {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: rgb(var(--color-surface-50) / 0.5);
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		border: 1px solid rgb(var(--color-surface-200) / 1);
		height: 3rem; /* Taller for easier touch */
	}

	:global(.dark) .slider-wrapper {
		background: rgb(var(--color-surface-900) / 0.5);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.slider-track-container {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
		height: 100%;
	}

	.slider {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 6px;
		border-radius: 3px;
		background: rgb(var(--color-surface-300) / 1);
		outline: none;
		cursor: pointer;
		position: absolute;
		margin: 0;
	}

	:global(.dark) .slider {
		background: rgb(var(--color-surface-600) / 1);
	}

	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: white;
		border: 2px solid rgb(var(--color-primary-500) / 1);
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
		transition: transform 0.1s;
		margin-top: -9px; /* Centering */
	}

	/* Center tick */
	.center-tick {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 2px;
		height: 12px;
		background: rgb(var(--color-surface-400) / 1);
		pointer-events: none;
		border-radius: 1px;
	}

	.slider-value {
		font-family: monospace;
		font-size: 0.875rem;
		font-weight: 600;
		color: rgb(var(--color-surface-500) / 1);
		min-width: 2.5rem;
		text-align: right;
	}

	.slider-value.changed {
		color: rgb(var(--color-primary-500) / 1);
	}

	.presets-scroll-container {
		display: flex;
		gap: 0.75rem;
		overflow-x: auto;
		padding: 0.5rem 0.25rem;
		width: 100%;
		scrollbar-width: none; /* Firefox */
	}

	.presets-scroll-container::-webkit-scrollbar {
		display: none; /* Chrome/Safari */
	}

	.preset-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		min-width: 4.5rem;
		background: transparent;
		border: none;
		cursor: pointer;
		opacity: 0.7;
		transition: all 0.2s;
	}

	.preset-card:hover {
		opacity: 1;
		transform: translateY(-2px);
	}

	.preset-icon-wrapper {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: white;
	}

	.preset-card:hover .preset-icon-wrapper {
		background: rgba(255, 255, 255, 0.2);
		border-color: rgba(255, 255, 255, 0.4);
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
	}

	.preset-name {
		font-size: 0.7rem;
		font-weight: 500;
		color: #9ca3af;
		text-align: center;
	}

	.preset-card:hover .preset-name {
		color: white;
	}

	.btn {
		height: 2rem; /* Ensure accessibility */
	}
</style>
