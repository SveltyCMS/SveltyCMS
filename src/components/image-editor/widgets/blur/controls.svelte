<!--
@file: src/components/image-editor/widgets/blur/controls.svelte
@component
Minimal blur controls focused on drag-resize rectangular regions.
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

<div class="blur-controls" role="toolbar" aria-label="Blur controls">
	<div class="control-group">
		<button type="button" class="btn btn-sm preset-filled-tertiary-500 dark:preset-filled-primary-500" onclick={onAddRegion} title="Add blur region">
			<iconify-icon icon="mdi:plus" width="18"></iconify-icon>
			<span>Add Region</span>
		</button>
		{#if regionCount > 0}
			<div class="badge preset-filled-surface-200 text-xs shrink-0">
				{regionCount}
				{regionCount === 1 ? 'region' : 'regions'}
			</div>
		{/if}
	</div>

	<div class="control-group flex-1">
		<label class="control-label" for="blur-strength-slider">Blur strength</label>
		<div class="slider-shell">
			<input
				id="blur-strength-slider"
				type="range"
				min="5"
				max="100"
				step="1"
				value={blurStrength}
				oninput={handleStrengthInput}
				class="slider"
				aria-label="Blur strength"
			/>
			<span class="slider-value">{blurStrength}</span>
		</div>
	</div>

	<div class="control-group ml-auto">
		<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={onReset}>
			<iconify-icon icon="mdi:restore" width="18"></iconify-icon>
			<span>Reset</span>
		</button>
		<button type="button" class="btn btn-sm preset-outlined-error-500" onclick={onDeleteRegion} disabled={!hasActiveRegion}>
			<iconify-icon icon="mdi:delete" width="18"></iconify-icon>
			<span>Delete</span>
		</button>
		<button type="button" class="btn btn-sm preset-outlined-error-500" onclick={onCancel}>
			<iconify-icon icon="mdi:close" width="18"></iconify-icon>
			<span>Cancel</span>
		</button>
		<button type="button" class="btn btn-sm preset-filled-success-500" onclick={onApply}>
			<iconify-icon icon="mdi:check" width="18"></iconify-icon>
			<span>Apply</span>
		</button>
	</div>
</div>

<style>
	.blur-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
		width: 100%;
		padding: 0.75rem;
		background: rgb(var(--color-surface-100) / 0.94);
		border-top: 1px solid rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .blur-controls {
		background: rgb(var(--color-surface-800) / 0.96);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.control-label {
		font-size: 0.875rem;
		font-weight: 500;
		white-space: nowrap;
		color: rgb(var(--color-surface-700) / 1);
	}

	:global(.dark) .control-label {
		color: rgb(var(--color-surface-200) / 1);
	}

	.slider-shell {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: min(24rem, 100%);
		padding: 0.45rem 0.75rem;
		border: 1px solid rgb(var(--color-surface-300) / 1);
		border-radius: 9999px;
		background: rgb(var(--color-surface-50) / 0.6);
	}

	:global(.dark) .slider-shell {
		background: rgb(var(--color-surface-900) / 0.48);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.slider {
		flex: 1;
		margin: 0;
		accent-color: rgb(var(--color-primary-500) / 1);
	}

	.slider-value {
		min-width: 2.5rem;
		font-family: monospace;
		font-size: 0.75rem;
		font-weight: 600;
		text-align: right;
		color: rgb(var(--color-primary-500) / 1);
	}

	@media (max-width: 1024px) {
		.blur-controls {
			padding: 0.5rem;
		}

		.control-group {
			gap: 0.35rem;
		}

		.slider-shell {
			min-width: 100%;
		}
	}
</style>
