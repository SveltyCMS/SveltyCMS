<!--
@file: src/components/imageEditor/widgets/Crop/Controls.svelte
@component
Modern, responsive crop controls with keyboard shortcuts and accessibility
-->
<script lang="ts">
	import { ASPECT_RATIO_PRESETS } from './aspect';
	import type { CropShape } from './regions';

	let {
		onRotateLeft,
		onRotateRight,
		onFlipHorizontal,
		onFlipVertical,
		onCropShapeChange,
		onAspectRatio,
		onApply,
		onCancel,
		onReset,
		cropShape
	}: {
		onRotateLeft: () => void;
		onRotateRight: () => void;
		onFlipHorizontal: () => void;
		onFlipVertical?: () => void;
		onCropShapeChange: (shape: CropShape) => void;
		onAspectRatio: (ratio: number | null) => void;
		onApply: () => void;
		onCancel: () => void;
		onReset?: () => void;
		cropShape: CropShape;
	} = $props();

	let activeRatio = $state<string>('Free');
	let showAllRatios = $state(false);

	const visiblePresets = $derived(showAllRatios ? ASPECT_RATIO_PRESETS : ASPECT_RATIO_PRESETS.slice(0, 6));

	function handleRatio(ratio: number | null, label: string) {
		activeRatio = label;
		onAspectRatio(ratio);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).tagName === 'INPUT') return;

		const cmdOrCtrl = e.metaKey || e.ctrlKey;

		switch (e.key) {
			case 'r':
			case 'R':
				if (!cmdOrCtrl) {
					e.preventDefault();
					onRotateRight();
				}
				break;
			case 'l':
			case 'L':
				if (!cmdOrCtrl) {
					e.preventDefault();
					onRotateLeft();
				}
				break;
			case 'f':
			case 'F':
				if (!cmdOrCtrl) {
					e.preventDefault();
					onFlipHorizontal();
				}
				break;
			case 'Enter':
				e.preventDefault();
				onApply();
				break;
			case 'Escape':
				e.preventDefault();
				onCancel();
				break;
			case '1':
				e.preventDefault();
				handleRatio(1, '1:1');
				break;
			case '2':
				e.preventDefault();
				handleRatio(16 / 9, '16:9');
				break;
			case '3':
				e.preventDefault();
				handleRatio(4 / 3, '4:3');
				break;
			case '0':
				e.preventDefault();
				handleRatio(null, 'Free');
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="crop-controls" role="toolbar" aria-label="Crop controls">
	<div class="control-group">
		<div class="aspect-ratios">
			{#each visiblePresets as preset, i}
				<button
					class="aspect-btn"
					class:active={activeRatio === preset.label}
					onclick={() => handleRatio(preset.value, preset.label)}
					title="{preset.description || preset.label}{i < 4 ? ` (${i})` : ''}"
					aria-label="Aspect ratio {preset.label}"
					aria-pressed={activeRatio === preset.label}
				>
					{#if preset.icon}
						<iconify-icon icon={preset.icon} width="16"></iconify-icon>
					{/if}
					<span>{preset.label}</span>
				</button>
			{/each}

			{#if ASPECT_RATIO_PRESETS.length > 6}
				<button class="aspect-btn more-btn" onclick={() => (showAllRatios = !showAllRatios)} title={showAllRatios ? 'Show less' : 'Show more ratios'}>
					<iconify-icon icon={showAllRatios ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="16"></iconify-icon>
				</button>
			{/if}
		</div>
	</div>

	<div class="control-group">
		<div class="btn-group" role="radiogroup" aria-label="Crop shape">
			<button
				class="btn"
				class:active={cropShape === 'rectangle' || cropShape === 'square'}
				onclick={() => onCropShapeChange('rectangle')}
				title="Rectangle"
			>
				<iconify-icon icon="mdi:crop-landscape" width="20"></iconify-icon>
			</button>
			<button class="btn" class:active={cropShape === 'circular'} onclick={() => onCropShapeChange('circular')} title="Circle">
				<iconify-icon icon="mdi:circle-outline" width="20"></iconify-icon>
			</button>
		</div>

		<div class="btn-group">
			<button class="btn" onclick={onRotateLeft} title="Rotate Left 90° (L)">
				<iconify-icon icon="mdi:rotate-left" width="20"></iconify-icon>
			</button>
			<button class="btn" onclick={onRotateRight} title="Rotate Right 90° (R)">
				<iconify-icon icon="mdi:rotate-right" width="20"></iconify-icon>
			</button>
			<button class="btn" onclick={onFlipHorizontal} title="Flip Horizontal (F)">
				<iconify-icon icon="mdi:flip-horizontal" width="20"></iconify-icon>
			</button>
			{#if onFlipVertical}
				<button class="btn" onclick={onFlipVertical} title="Flip Vertical">
					<iconify-icon icon="mdi:flip-vertical" width="20"></iconify-icon>
				</button>
			{/if}
		</div>
	</div>

	<div class="flex-1 hidden lg:block"></div>

	<div class="actions">
		{#if onReset}
			<button class="btn btn-sm preset-outlined-surface-500 hidden sm:flex" onclick={onReset} title="Reset">
				<iconify-icon icon="mdi:restore" width="18"></iconify-icon>
				<span class="hidden lg:inline">Reset</span>
			</button>
		{/if}

		<div class="flex gap-2">
			<button class="btn btn-sm preset-outlined-error-500" onclick={onCancel} title="Cancel (Esc)">
				<iconify-icon icon="mdi:close" width="18"></iconify-icon>
				<span class="hidden sm:inline">Cancel</span>
			</button>

			<button class="btn btn-sm preset-filled-success-500" onclick={onApply} title="Apply (Enter)">
				<iconify-icon icon="mdi:check" width="18"></iconify-icon>
				<span class="sm:inline">Apply</span>
			</button>
		</div>
	</div>
</div>

<style>
	.crop-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: rgb(var(--color-surface-100) / 1);
		border-top: 1px solid rgb(var(--color-surface-200) / 1);
		width: 100%;
	}

	:global(.dark) .crop-controls {
		background: rgb(var(--color-surface-800) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.control-label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgb(var(--color-surface-500) / 1);
		white-space: nowrap;
	}

	:global(.dark) .control-label {
		color: rgb(var(--color-surface-400) / 1);
	}

	.aspect-ratios {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.aspect-btn {
		height: 2rem;
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0 0.75rem;
		font-size: 0.75rem;
		font-weight: 600;
		border: 1px solid rgb(var(--color-surface-300) / 1);
		border-radius: 0.375rem;
		background: rgb(var(--color-surface-50) / 1);
		color: rgb(var(--color-surface-700) / 1);
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
	}

	:global(.dark) .aspect-btn {
		background: rgb(var(--color-surface-700) / 1);
		border-color: rgb(var(--color-surface-600) / 1);
		color: rgb(var(--color-surface-200) / 1);
	}

	.aspect-btn:hover {
		background: rgb(var(--color-surface-100) / 1);
		border-color: rgb(var(--color-primary-400) / 1);
	}

	:global(.dark) .aspect-btn:hover {
		background: rgb(var(--color-surface-600) / 1);
	}

	.aspect-btn.active {
		background: rgb(var(--color-primary-500) / 1);
		border-color: rgb(var(--color-primary-500) / 1);
		color: white;
	}

	.more-btn {
		padding: 0 0.5rem;
		min-width: 2rem;
		justify-content: center;
	}

	.btn-group {
		display: flex;
		gap: 0;
		border-radius: 0.375rem;
		overflow: hidden;
		border: 1px solid rgb(var(--color-surface-300) / 1);
		background: rgb(var(--color-surface-50) / 1);
	}

	:global(.dark) .btn-group {
		border-color: rgb(var(--color-surface-600) / 1);
		background: rgb(var(--color-surface-700) / 1);
	}

	.btn-group .btn {
		border-radius: 0;
		border: none;
		border-right: 1px solid rgb(var(--color-surface-300) / 1);
		height: 2rem;
		width: 2rem;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.btn-group .btn:last-child {
		border-right: none;
	}

	.btn-group .btn.active {
		background: rgb(var(--color-primary-500) / 1);
		color: white;
	}

	.divider {
		width: 1px;
		height: 1.5rem;
		background: rgb(var(--color-surface-300) / 1);
		flex-shrink: 0;
	}

	:global(.dark) .divider {
		background: rgb(var(--color-surface-600) / 1);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-shrink: 0;
		margin-left: auto;
	}

	@media (max-width: 1024px) {
		.crop-controls {
			row-gap: 1rem;
		}

		.actions {
			margin-left: 0;
			width: 100%;
			justify-content: flex-end;
			border-top: 1px solid rgb(var(--color-surface-200) / 0.5);
			padding-top: 0.75rem;
		}
	}
</style>
