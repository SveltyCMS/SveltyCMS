<!--
@file src/components/image-editor/widgets/crop/controls-mobile.svelte
@component
Mobile crop controls — compact aspect/shape strips; no x/y/w/h or rotate/flip (header quick actions).
-->
<script lang="ts">
	import type { CropShape } from './types';
	import { imageEditorStore } from '@components/image-editor/image-editor-store.svelte';

	let {
		onCropShapeChange,
		onAspectRatio,
		cropShape
	}: {
		onCropShapeChange: (shape: CropShape) => void;
		onAspectRatio: (ratio: number | null) => void;
		cropShape: CropShape;
	} = $props();

	interface AspectPreset {
		label: string;
		ratio: number;
	}

	const aspectPresets: AspectPreset[] = [
		{ label: 'Free', ratio: 0 },
		{ label: '1:1', ratio: 1 },
		{ label: '4:3', ratio: 4 / 3 },
		{ label: '3:2', ratio: 3 / 2 },
		{ label: '16:9', ratio: 16 / 9 }
	];

	const shapePresets: { id: CropShape; label: string }[] = [
		{ id: 'square', label: 'Square' },
		{ id: 'circular', label: 'Circle' }
	];

	let activePreset = $state(0);

	$effect(() => {
		const cropState = imageEditorStore.state.crop;
		const ratio = imageEditorStore.state.currentAspectRatio;
		if (cropState === null || ratio === null) {
			activePreset = 0;
			return;
		}
		const matchIndex = aspectPresets.findIndex((p) => p.ratio === ratio);
		if (matchIndex !== -1) {
			activePreset = matchIndex;
		}
	});

	function selectPreset(preset: AspectPreset, index: number) {
		activePreset = index;
		onAspectRatio(preset.ratio || null);
	}

	function isShapeActive(id: CropShape): boolean {
		return cropShape === id;
	}
</script>

<div class="crop-controls-mobile" role="toolbar" aria-label="Crop controls">
	<div class="crop-mobile-strip" role="group" aria-label="Crop options">
		{#each aspectPresets as preset, i (preset.label)}
			<button
				type="button"
				class="crop-mobile-pill"
				class:crop-mobile-pill-active={activePreset === i}
				onclick={() => selectPreset(preset, i)}
				aria-label="Aspect ratio {preset.label}"
				aria-pressed={activePreset === i}
			>
				{preset.label}
			</button>
		{/each}

		<span class="crop-mobile-divider" aria-hidden="true"></span>

		{#each shapePresets as shape (shape.id)}
			<button
				type="button"
				class="crop-mobile-pill"
				class:crop-mobile-pill-active={isShapeActive(shape.id)}
				onclick={() => onCropShapeChange(shape.id)}
				aria-label={shape.label}
				aria-pressed={isShapeActive(shape.id)}
			>
				{shape.label}
			</button>
		{/each}
	</div>
</div>

<style>
	.crop-controls-mobile {
		display: flex;
		justify-content: center;
		width: 100%;
	}

	.crop-mobile-strip {
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

	.crop-mobile-strip::-webkit-scrollbar {
		display: none;
	}

	.crop-mobile-divider {
		flex: 0 0 1px;
		align-self: stretch;
		width: 1px;
		min-height: 1.25rem;
		margin-inline: 0.25rem;
		background: color-mix(in oklch, var(--editor-chrome-text, #fff) 18%, transparent);
	}

	.crop-mobile-pill {
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

	.crop-mobile-pill:active:not(:disabled) {
		transform: scale(0.96);
	}

	.crop-mobile-pill-active {
		color: var(--editor-chip-active-text, #141414);
		background: var(--editor-chip-active-bg, rgba(255, 255, 255, 0.94));
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14);
	}
</style>
