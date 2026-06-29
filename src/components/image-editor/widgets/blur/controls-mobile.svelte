<!--
@file src/components/image-editor/widgets/blur/controls-mobile.svelte
@component
Mobile blur controls — compact centered action strip; strength slider lives in editor-mobile-panel.
-->
<script lang="ts">
	let {
		hasActiveRegion = false,
		regionCount = 0,
		onAddRegion,
		onDeleteRegion,
		onReset,
		onApply,
		onCancel
	}: {
		hasActiveRegion?: boolean;
		regionCount?: number;
		onAddRegion: () => void;
		onDeleteRegion: () => void;
		onReset: () => void;
		onApply: () => void;
		onCancel: () => void;
	} = $props();
</script>

<div class="blur-controls-mobile" role="toolbar" aria-label="Blur controls">
	<div class="blur-mobile-strip" role="group" aria-label="Blur actions">
		<button
			type="button"
			class="blur-mobile-pill"
			onclick={onAddRegion}
			aria-label="Add blur region"
		>
			Add{regionCount > 0 ? ` (${regionCount})` : ''}
		</button>

		<button
			type="button"
			class="blur-mobile-pill"
			class:blur-mobile-pill-disabled={!hasActiveRegion}
			onclick={onDeleteRegion}
			disabled={!hasActiveRegion}
			aria-label="Delete selected region"
		>
			Delete
		</button>

		<button
			type="button"
			class="blur-mobile-pill"
			class:blur-mobile-pill-disabled={regionCount === 0}
			onclick={onReset}
			disabled={regionCount === 0}
			aria-label="Reset all blur regions"
		>
			Reset
		</button>

		<button type="button" class="blur-mobile-pill" onclick={onCancel} aria-label="Cancel blur">
			Cancel
		</button>

		<button type="button" class="blur-mobile-pill blur-mobile-pill-apply" onclick={onApply} aria-label="Apply blur">
			Apply
		</button>
	</div>
</div>

<style>
	.blur-controls-mobile {
		display: flex;
		justify-content: center;
		width: 100%;
	}

	.blur-mobile-strip {
		display: inline-flex;
		flex-wrap: nowrap;
		gap: 0.125rem;
		align-items: center;
		width: fit-content;
		max-width: 100%;
		padding: 0.125rem;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scroll-snap-type: x proximity;
		scrollbar-width: none;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: var(--editor-radius-pill, 9999px);
		backdrop-filter: blur(10px);
	}

	.blur-mobile-strip::-webkit-scrollbar {
		display: none;
	}

	.blur-mobile-pill {
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
			transform 0.1s ease,
			opacity 0.15s ease;
	}

	.blur-mobile-pill:active:not(:disabled) {
		transform: scale(0.96);
	}

	.blur-mobile-pill-disabled,
	.blur-mobile-pill:disabled {
		cursor: not-allowed;
		opacity: 0.38;
	}

	.blur-mobile-pill-apply {
		color: rgba(255, 255, 255, 0.94);
	}

	.blur-mobile-pill-apply:not(:disabled):active {
		color: #141414;
		background: rgba(255, 255, 255, 0.94);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14);
	}
</style>
