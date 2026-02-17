<!--
@file: src/components/imageEditor/toolbars/BlurControls.svelte
@component
Pintura-style controls for the Blur tool with add/delete/rotate/flip functionality.
-->
<script lang="ts">
	import type { BlurPattern, BlurShape } from './types';

	let {
		blurStrength,
		shape,
		pattern,
		hasActiveRegion = false,
		onStrengthChange,
		onShapeChange,
		onPatternChange,
		onAddRegion,
		onDeleteRegion,
		onRotateLeft,
		onRotateRight,
		onFlipHorizontal,
		onReset,
		onCancel,
		onApply
	}: {
		blurStrength: number;
		shape: BlurShape;
		pattern: BlurPattern;
		hasActiveRegion?: boolean;
		onStrengthChange: (value: number) => void;
		onShapeChange: (value: BlurShape) => void;
		onPatternChange: (value: BlurPattern) => void;
		onAddRegion: () => void;
		onDeleteRegion: () => void;
		onRotateLeft: () => void;
		onRotateRight: () => void;
		onFlipHorizontal: () => void;
		onReset: () => void;
		onCancel: () => void;
		onApply: () => void;
	} = $props();

	function handleStrengthInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onStrengthChange(Number.parseInt(target.value, 10));
	}
</script>

<div class="blur-controls" role="toolbar" aria-label="Blur controls">
	<!-- Group 1: Add Region -->
	<div class="control-group">
		<button class="btn btn-sm preset-filled-primary-500" onclick={onAddRegion} title="Add Blur Region">
			<iconify-icon icon="mdi:plus" width="18"></iconify-icon>
			<span class="hidden sm:inline">Add Region</span>
		</button>
	</div>

	<!-- Group 2: Shape & Pattern -->
	<div class="control-group">
		<div class="btn-group">
			<button class="btn" class:active={shape === 'rectangle'} onclick={() => onShapeChange('rectangle')} title="Rectangle">
				<iconify-icon icon="mdi:crop-square" width="20"></iconify-icon>
			</button>
			<button class="btn" class:active={shape === 'ellipse'} onclick={() => onShapeChange('ellipse')} title="Ellipse">
				<iconify-icon icon="mdi:circle-outline" width="20"></iconify-icon>
			</button>
		</div>

		<div class="btn-group">
			<button class="btn" class:active={pattern === 'blur'} onclick={() => onPatternChange('blur')} title="Blur">
				<iconify-icon icon="mdi:blur" width="20"></iconify-icon>
			</button>
			<button class="btn" class:active={pattern === 'pixelate'} onclick={() => onPatternChange('pixelate')} title="Pixelate">
				<iconify-icon icon="mdi:grid" width="20"></iconify-icon>
			</button>
		</div>
	</div>

	<!-- Group 3: Strength Slider -->
	<div class="control-group flex-1">
		<div class="slider-wrapper">
			<div class="slider-track-container">
				<input
					type="range"
					min="5"
					max={pattern === 'pixelate' ? 50 : 100}
					step="1"
					value={blurStrength}
					oninput={handleStrengthInput}
					class="slider"
					aria-label="Blur strength"
				>
			</div>
			<div class="slider-value">{blurStrength}</div>
		</div>
	</div>

	{#if hasActiveRegion}
		<div class="divider hidden lg:block"></div>

		<!-- Group 4: Transform -->
		<div class="control-group">
			<div class="btn-group">
				<button class="btn" onclick={onRotateLeft} title="Rotate Left"><iconify-icon icon="mdi:rotate-left" width="20"></iconify-icon></button>
				<button class="btn" onclick={onRotateRight} title="Rotate Right"><iconify-icon icon="mdi:rotate-right" width="20"></iconify-icon></button>
				<button class="btn" onclick={onFlipHorizontal} title="Flip Horizontal">
					<iconify-icon icon="mdi:flip-horizontal" width="20"></iconify-icon>
				</button>
			</div>

			<button class="btn btn-icon btn-sm preset-outlined-error-500" onclick={onDeleteRegion} title="Delete Selected Region">
				<iconify-icon icon="mdi:delete" width="18"></iconify-icon>
			</button>
		</div>
	{/if}

	<!-- Spacer -->
	<div class="flex-1 hidden lg:block"></div>

	<!-- Actions -->
	<div class="actions">
		<button onclick={onReset} class="btn btn-sm preset-outlined-surface-500 hidden sm:flex">
			<iconify-icon icon="mdi:restore" width="18"></iconify-icon>
			<span class="hidden sm:inline">Reset</span>
		</button>

		<button onclick={onCancel} class="btn btn-sm preset-outlined-error-500">
			<iconify-icon icon="mdi:close" width="18"></iconify-icon>
			<span class="hidden sm:inline">Cancel</span>
		</button>

		<button class="btn btn-sm preset-filled-success-500" onclick={onApply}>
			<iconify-icon icon="mdi:check" width="18"></iconify-icon>
			<span class="hidden sm:inline">Apply</span>
		</button>
	</div>
</div>

<style>
	.blur-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 0;
		background: transparent;
		border: none;
	}

	:global(.dark) .blur-controls {
		background: rgb(var(--color-surface-800) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.control-group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.btn-group {
		display: flex;
		gap: 0;
		overflow: hidden;
		background: rgb(var(--color-surface-50) / 1);
		border: 1px solid rgb(var(--color-surface-300) / 1);
		border-radius: 0.375rem;
	}

	:global(.dark) .btn-group {
		background: rgb(var(--color-surface-700) / 1);
		border-color: rgb(var(--color-surface-600) / 1);
	}

	.btn-group .btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: none;
		border-right: 1px solid rgb(var(--color-surface-300) / 1);
		border-radius: 0;
	}

	.btn-group .btn:last-child {
		border-right: none;
	}

	.btn-group .btn.active {
		color: white;
		background: rgb(var(--color-primary-500) / 1);
	}

	/* Slider */
	.slider-wrapper {
		display: flex;
		flex: 1;
		gap: 0.75rem;
		align-items: center;
		min-width: 160px;
		height: 2.25rem;
		padding: 0.25rem 0.75rem;
		background: rgb(var(--color-surface-50) / 0.5);
		border: 1px solid rgb(var(--color-surface-200) / 1);
		border-radius: 9999px;
	}

	:global(.dark) .slider-wrapper {
		background: rgb(var(--color-surface-900) / 0.5);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.slider-track-container {
		position: relative;
		display: flex;
		flex: 1;
		align-items: center;
		height: 100%;
	}

	.slider {
		position: absolute;
		width: 100%;
		height: 4px;
		margin: 0;
		-webkit-appearance: none;
		appearance: none;
		cursor: pointer;
		outline: none;
		background: rgb(var(--color-surface-300) / 1);
		border-radius: 2px;
	}

	:global(.dark) .slider {
		background: rgb(var(--color-surface-600) / 1);
	}

	.slider::-webkit-slider-thumb {
		width: 16px;
		height: 16px;
		margin-top: -6px;
		-webkit-appearance: none;
		appearance: none;
		cursor: pointer;
		background: white;
		border: 2px solid rgb(var(--color-primary-500) / 1);
		border-radius: 50%;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
		transition: transform 0.1s;
	}

	.slider-value {
		min-width: 2rem;
		font-family: monospace;
		font-size: 0.75rem;
		font-weight: 600;
		color: rgb(var(--color-primary-500) / 1);
		text-align: right;
	}

	.divider {
		flex-shrink: 0;
		width: 1px;
		height: 1.5rem;
		background: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .divider {
		background: rgb(var(--color-surface-600) / 1);
	}

	.actions {
		display: flex;
		flex-shrink: 0;
		gap: 0.5rem;
		align-items: center;
		margin-left: auto;
	}

	/* Mobile */
	@media (max-width: 1024px) {
		.blur-controls {
			row-gap: 1rem;
		}

		.actions {
			justify-content: flex-end;
			width: 100%;
			padding-top: 0.75rem;
			margin-left: 0;
			border-top: 1px solid rgb(var(--color-surface-200) / 0.5);
		}
	}
</style>
