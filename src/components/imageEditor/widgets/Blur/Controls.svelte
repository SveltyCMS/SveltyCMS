<!--
@file: src/components/imageEditor/toolbars/BlurControls.svelte
@component
Pintura-style controls for the Blur tool with add/delete/rotate/flip functionality.
-->
<script lang="ts">
	import type { BlurPattern, BlurShape } from '@src/components/imageEditor/widgets/Blur/regions';

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
		onStrengthChange(parseInt(target.value, 10));
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
				/>
			</div>
			<div class="slider-value">
				{blurStrength}
			</div>
		</div>
	</div>

	{#if hasActiveRegion}
		<div class="divider hidden lg:block"></div>

		<!-- Group 4: Transform -->
		<div class="control-group">
			<div class="btn-group">
				<button class="btn" onclick={onRotateLeft} title="Rotate Left">
					<iconify-icon icon="mdi:rotate-left" width="20"></iconify-icon>
				</button>
				<button class="btn" onclick={onRotateRight} title="Rotate Right">
					<iconify-icon icon="mdi:rotate-right" width="20"></iconify-icon>
				</button>
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
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: rgb(var(--color-surface-100) / 1);
		border-top: 1px solid rgb(var(--color-surface-200) / 1);
		width: 100%;
	}

	:global(.dark) .blur-controls {
		background: rgb(var(--color-surface-800) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
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

	/* Slider */
	.slider-wrapper {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: rgb(var(--color-surface-50) / 0.5);
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		border: 1px solid rgb(var(--color-surface-200) / 1);
		height: 2.25rem;
		min-width: 160px;
		flex: 1;
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
		height: 4px;
		border-radius: 2px;
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
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		border: 2px solid rgb(var(--color-primary-500) / 1);
		cursor: pointer;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
		transition: transform 0.1s;
		margin-top: -6px;
	}

	.slider-value {
		min-width: 2rem;
		text-align: right;
		font-size: 0.75rem;
		font-weight: 600;
		font-family: monospace;
		color: rgb(var(--color-primary-500) / 1);
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

	/* Mobile */
	@media (max-width: 1024px) {
		.blur-controls {
			row-gap: 1rem;
		}

		.actions {
			width: 100%;
			justify-content: flex-end;
			border-top: 1px solid rgb(var(--color-surface-200) / 0.5);
			padding-top: 0.75rem;
			margin-left: 0;
		}
	}
</style>
