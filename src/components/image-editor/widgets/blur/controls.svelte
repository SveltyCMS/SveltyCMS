<!--
@file: src/components/image-editor/widgets/blur/controls.svelte
@component
Pintura-style blur bottom dock — glass pills, aligned slider, no solid CMS buttons.
-->
<script lang="ts">
	let {
		blurStrength,
		hasActiveRegion = false,
		regionCount = 0,
		onStrengthChange,
		onAddRegion,
		onDeleteRegion,
		onReset,
		onCancel,
		onApply
	}: {
		blurStrength: number;
		hasActiveRegion?: boolean;
		regionCount?: number;
		onStrengthChange: (value: number) => void;
		onAddRegion: () => void;
		onDeleteRegion: () => void;
		onReset: () => void;
		onCancel: () => void;
		onApply: () => void;
	} = $props();

	const sliderProgress = $derived(Math.max(0, Math.min(1, (blurStrength - 5) / 95)));

	function handleStrengthInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onStrengthChange(Number.parseInt(target.value, 10));
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.target && (e.target as HTMLElement).tagName === 'INPUT') {
			return;
		}

		if ((e.key === 'Delete' || e.key === 'Backspace') && hasActiveRegion) {
			e.preventDefault();
			onDeleteRegion();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="editor-dock blur-dock" role="toolbar" aria-label="Blur controls">
	<div class="dock-row dock-row-scroll blur-dock-row">
		<div class="dock-pill-group" role="group" aria-label="Blur regions">
			<button type="button" class="dock-pill" onclick={onAddRegion} title="Add blur region" aria-label="Add blur region">
				<iconify-icon icon="mdi:plus" width="15" aria-hidden="true"></iconify-icon>
				<span>Add region</span>
			</button>
		</div>

		{#if regionCount > 0}
			<span class="dock-pill-badge" aria-live="polite">
				{regionCount} {regionCount === 1 ? 'region' : 'regions'}
			</span>
		{/if}

		<div class="blur-slider-wrap">
			<label class="slider-label" for="blur-strength-slider">Blur strength</label>
			<div class="slider-track">
				<input
					id="blur-strength-slider"
					type="range"
					min="5"
					max="100"
					step="1"
					value={blurStrength}
					oninput={handleStrengthInput}
					class="slider-input"
					style:--slider-progress="{sliderProgress * 100}%"
					aria-label="Blur strength"
					aria-valuemin={5}
					aria-valuemax={100}
					aria-valuenow={blurStrength}
				/>
				<span class="slider-value slider-value-changed">{blurStrength}</span>
			</div>
		</div>

		<div class="dock-pill-group blur-actions" role="group" aria-label="Blur actions">
			<button
				type="button"
				class="dock-pill"
				onclick={onReset}
				disabled={regionCount === 0}
				title="Reset all regions"
				aria-label="Reset all blur regions"
			>
				<iconify-icon icon="mdi:restore" width="15" aria-hidden="true"></iconify-icon>
				<span>Reset</span>
			</button>
			<button
				type="button"
				class="dock-pill dock-pill-warn"
				onclick={onDeleteRegion}
				disabled={!hasActiveRegion}
				title="Delete selected region"
				aria-label="Delete selected blur region"
			>
				<iconify-icon icon="mdi:delete-outline" width="15" aria-hidden="true"></iconify-icon>
				<span>Delete</span>
			</button>
			<button type="button" class="dock-pill" onclick={onCancel} title="Cancel blur" aria-label="Cancel blur">
				<iconify-icon icon="mdi:close" width="15" aria-hidden="true"></iconify-icon>
				<span>Cancel</span>
			</button>
		</div>

		<button type="button" class="dock-pill dock-pill-apply blur-apply-btn" onclick={onApply} title="Apply blur" aria-label="Apply blur">
			<iconify-icon icon="mdi:check" width="15" aria-hidden="true"></iconify-icon>
			<span>Apply</span>
		</button>
	</div>
</div>

<style>
	@import '../../editor-dock.css';

	.blur-dock-row {
		gap: 0.5rem;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding-inline: 0.125rem;
	}

	.blur-slider-wrap {
		display: flex;
		flex: 1 1 12rem;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 10rem;
		max-width: 22rem;
		margin-inline: 0.25rem;
	}

	.blur-slider-wrap .slider-track {
		width: 100%;
	}

	.blur-slider-wrap .slider-input {
		background: linear-gradient(
			to right,
			rgba(255, 255, 255, 0.55) 0%,
			rgba(255, 255, 255, 0.55) var(--slider-progress, 0%),
			rgba(255, 255, 255, 0.18) var(--slider-progress, 0%),
			rgba(255, 255, 255, 0.18) 100%
		);
	}

	.blur-actions {
		flex-shrink: 0;
	}

	.blur-apply-btn {
		flex-shrink: 0;
	}

	@media (max-width: 1024px) {
		.blur-dock-row {
			justify-content: flex-start;
		}

		.blur-slider-wrap {
			flex-basis: 100%;
			order: 3;
			max-width: none;
			margin-inline: 0;
		}
	}
</style>
