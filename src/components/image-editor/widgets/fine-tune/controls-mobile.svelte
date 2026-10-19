<!--
@file src/components/image-editor/widgets/fine-tune/controls-mobile.svelte
@component
Mobile fine-tune pill strip — slider lives in editor-mobile-panel (same as crop rotation).
-->
<script lang="ts">
	import { ADJUSTMENT_CONFIGS, type Adjustments } from './adjustments';

	let {
		activeAdjustment,
		adjustments,
		onAdjustmentChange
	}: {
		activeAdjustment: keyof Adjustments;
		adjustments?: Adjustments;
		onAdjustmentChange: (key: keyof Adjustments) => void;
	} = $props();

	function hasChange(key: keyof Adjustments): boolean {
		return (adjustments?.[key] ?? 0) !== 0;
	}
</script>

<div class="finetune-controls-mobile" role="toolbar" aria-label="Fine-tune controls">
	<div class="finetune-mobile-strip" role="group" aria-label="Adjustments">
		{#each ADJUSTMENT_CONFIGS as adj (adj.key)}
			<button
				type="button"
				class="finetune-mobile-pill"
				class:finetune-mobile-pill-active={activeAdjustment === adj.key}
				class:finetune-mobile-pill-changed={hasChange(adj.key) && activeAdjustment !== adj.key}
				onclick={() => onAdjustmentChange(adj.key)}
				aria-label="Adjust {adj.label}"
				aria-pressed={activeAdjustment === adj.key}
			>
				{adj.label}
			</button>
		{/each}
	</div>
</div>

<style>
	.finetune-controls-mobile {
		display: flex;
		justify-content: center;
		width: 100%;
	}

	.finetune-mobile-strip {
		display: inline-flex;
		flex-wrap: nowrap;
		gap: 0.25rem;
		align-items: center;
		width: fit-content;
		max-width: 100%;
		padding: 0.25rem;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scroll-snap-type: x proximity;
		scrollbar-width: none;
		background: var(
			--editor-chrome-elevated,
			color-mix(in oklch, var(--editor-chrome-text, #fff) 8%, transparent)
		);
		border: 1px solid
			var(
				--editor-chrome-border,
				color-mix(in oklch, var(--editor-chrome-text, #fff) 12%, transparent)
			);
		border-radius: var(--editor-radius-pill, 9999px);
		backdrop-filter: blur(10px);
	}

	.finetune-mobile-strip::-webkit-scrollbar {
		display: none;
	}

	.finetune-mobile-pill {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		scroll-snap-align: center;
		min-height: 2.5rem;
		padding-inline: 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		line-height: 1;
		color: var(--editor-chrome-text, rgba(255, 255, 255, 0.72));
		white-space: nowrap;
		cursor: pointer;
		background: transparent;
		border: none;
		border-radius: var(--editor-radius-pill, 9999px);
		transition:
			background 0.15s ease,
			color 0.15s ease,
			transform 0.1s ease;
	}

	.finetune-mobile-pill-changed {
		color: var(--editor-chrome-text-active, rgba(255, 255, 255, 0.92));
	}

	.finetune-mobile-pill:active:not(:disabled) {
		transform: scale(0.96);
	}

	.finetune-mobile-pill-active {
		color: var(--editor-chip-active-text, #141414);
		background: var(--editor-chip-active-bg, rgba(255, 255, 255, 0.94));
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14);
	}

	.finetune-mobile-pill-active.finetune-mobile-pill-changed {
		color: var(--editor-chip-active-text, #141414);
	}
</style>
