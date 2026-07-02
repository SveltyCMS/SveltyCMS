<!--
@file src/components/image-editor/widgets/focal-point/controls-mobile.svelte
@component
Mobile focal point controls — preset strip + reset; X/Y sliders live in editor-mobile-panel.
-->
<script lang="ts">
	let {
		focalX = 50,
		focalY = 50,
		onReset,
		onPointChange,
		onPointCommit
	}: {
		focalX?: number;
		focalY?: number;
		onReset?: () => void;
		onPointChange?: (nextPoint: { x: number; y: number }) => void;
		onPointCommit?: () => void;
	} = $props();

	const presets = [
		{ label: 'Center', x: 50, y: 50 },
		{ label: 'Top', x: 50, y: 15 },
		{ label: 'Bottom', x: 50, y: 85 },
		{ label: 'Left', x: 15, y: 50 },
		{ label: 'Right', x: 85, y: 50 }
	] as const;

	function isPresetActive(x: number, y: number): boolean {
		return Math.abs(focalX - x) <= 2 && Math.abs(focalY - y) <= 2;
	}

	function applyPreset(x: number, y: number) {
		onPointChange?.({ x, y });
		onPointCommit?.();
	}

	function handleReset() {
		onReset?.();
		onPointCommit?.();
	}
</script>

<div class="focal-controls-mobile" role="toolbar" aria-label="Focal point controls">
	<p class="focal-mobile-hint">
		<iconify-icon icon="mdi:gesture-tap" width="14" aria-hidden="true"></iconify-icon>
		Tap the image to set focus
	</p>

	<div class="focal-mobile-strip" role="group" aria-label="Focal point presets">
		{#each presets as preset (preset.label)}
			<button
				type="button"
				class="focal-mobile-pill"
				class:focal-mobile-pill-active={isPresetActive(preset.x, preset.y)}
				onclick={() => applyPreset(preset.x, preset.y)}
				aria-label="Focal point {preset.label}"
				aria-pressed={isPresetActive(preset.x, preset.y)}
			>
				{preset.label}
			</button>
		{/each}

		<span class="focal-mobile-divider" aria-hidden="true"></span>

		<button type="button" class="focal-mobile-pill" onclick={handleReset} aria-label="Reset focal point to center">
			Reset
		</button>
	</div>
</div>

<style>
	.focal-controls-mobile {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		align-items: center;
		width: 100%;
		min-width: 0;
	}

	.focal-mobile-hint {
		display: inline-flex;
		gap: 0.3125rem;
		align-items: center;
		margin: 0;
		font-size: 0.6875rem;
		font-weight: 500;
		line-height: 1.2;
		color: rgba(255, 255, 255, 0.48);
	}

	.focal-mobile-strip {
		display: inline-flex;
		flex-wrap: nowrap;
		gap: 0.125rem;
		align-items: center;
		width: fit-content;
		max-width: 100%;
		padding: 0.125rem;
		overflow-x: auto;
		overflow-y: hidden;
		-webkit-overflow-scrolling: touch;
		touch-action: pan-x;
		overscroll-behavior-x: contain;
		scroll-snap-type: x proximity;
		scrollbar-width: none;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: var(--editor-radius-pill, 9999px);
		backdrop-filter: blur(10px);
		box-sizing: border-box;
	}

	.focal-mobile-strip::-webkit-scrollbar {
		display: none;
	}

	.focal-mobile-divider {
		flex: 0 0 1px;
		align-self: stretch;
		width: 1px;
		min-height: 1.125rem;
		margin-inline: 0.0625rem;
		background: rgba(255, 255, 255, 0.14);
	}

	.focal-mobile-pill {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		scroll-snap-align: center;
		height: 1.75rem;
		padding-inline: 0.5625rem;
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1;
		color: rgba(255, 255, 255, 0.72);
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

	.focal-mobile-pill:active:not(:disabled) {
		transform: scale(0.96);
	}

	.focal-mobile-pill-active {
		color: #141414;
		background: rgba(255, 255, 255, 0.94);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14);
	}
</style>
