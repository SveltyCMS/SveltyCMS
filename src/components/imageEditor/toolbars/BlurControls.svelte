<!--
@file: src/components/imageEditor/toolbars/BlurControls.svelte
@component
Pintura-style controls for the Blur tool with responsive design and keyboard support.
-->
<script lang="ts">
	import type { BlurPattern, BlurShape } from '@src/components/imageEditor/widgets/Blur/regions';

	// Constants
	const BLUR_MIN = 5;
	const BLUR_MAX = 100;
	const PIXELATE_MIN = 5;
	const PIXELATE_MAX = 50;

	let {
		blurStrength,
		shape,
		pattern,
		hasActiveRegion = false,
		regionCount = 0,
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
		regionCount?: number;
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

	// Derived values
	const minStrength = $derived(pattern === 'pixelate' ? PIXELATE_MIN : BLUR_MIN);
	const maxStrength = $derived(pattern === 'pixelate' ? PIXELATE_MAX : BLUR_MAX);
	const strengthLabel = $derived(pattern === 'pixelate' ? 'Size' : 'Strength');

	function handleStrengthInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onStrengthChange(parseInt(target.value, 10));
	}

	// Keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return;

		switch (e.key) {
			case 'r':
			case 'R':
				e.preventDefault();
				onShapeChange('rectangle');
				break;
			case 'e':
			case 'E':
				e.preventDefault();
				onShapeChange('ellipse');
				break;
			case 'b':
			case 'B':
				e.preventDefault();
				onPatternChange('blur');
				break;
			case 'p':
			case 'P':
				e.preventDefault();
				onPatternChange('pixelate');
				break;
			case 'Delete':
			case 'Backspace':
				if (hasActiveRegion) {
					e.preventDefault();
					onDeleteRegion();
				}
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- Mobile-optimized layout -->
<div class="blur-controls flex w-full flex-wrap items-center gap-2 lg:gap-3">
	<!-- Add Region Button -->
	<button
		class="btn btn-sm preset-filled-primary-500 shrink-0"
		onclick={onAddRegion}
		title="Add Blur Region (Click on image)"
		aria-label="Add blur region"
	>
		<iconify-icon icon="mdi:plus" width="18"></iconify-icon>
		<span class="hidden sm:inline">Add Region</span>
	</button>

	<!-- Region Count Badge -->
	{#if regionCount > 0}
		<div class="badge preset-filled-surface-200 text-xs shrink-0">
			{regionCount}
			{regionCount === 1 ? 'region' : 'regions'}
		</div>
	{/if}

	<div class="divider-vertical"></div>

	<!-- Shape Selection -->
	<div class="control-group">
		<span class="control-label">Shape:</span>
		<div class="btn-group-compact" role="radiogroup" aria-label="Blur shape">
			<button
				class="btn btn-sm"
				class:active={shape === 'rectangle'}
				onclick={() => onShapeChange('rectangle')}
				title="Rectangle (R)"
				aria-label="Rectangle shape"
				aria-pressed={shape === 'rectangle'}
			>
				<iconify-icon icon="mdi:crop-square" width="18"></iconify-icon>
				<span class="sr-only">Rectangle</span>
			</button>
			<button
				class="btn btn-sm"
				class:active={shape === 'ellipse'}
				onclick={() => onShapeChange('ellipse')}
				title="Ellipse (E)"
				aria-label="Ellipse shape"
				aria-pressed={shape === 'ellipse'}
			>
				<iconify-icon icon="mdi:circle-outline" width="18"></iconify-icon>
				<span class="sr-only">Ellipse</span>
			</button>
		</div>
	</div>

	<div class="divider-vertical"></div>

	<!-- Pattern Selection -->
	<div class="control-group">
		<span class="control-label">Effect:</span>
		<div class="btn-group-compact" role="radiogroup" aria-label="Blur pattern">
			<button
				class="btn btn-sm"
				class:active={pattern === 'blur'}
				onclick={() => onPatternChange('blur')}
				title="Blur (B)"
				aria-label="Blur effect"
				aria-pressed={pattern === 'blur'}
			>
				<iconify-icon icon="mdi:blur" width="18"></iconify-icon>
				<span class="hidden md:inline ml-1">Blur</span>
			</button>
			<button
				class="btn btn-sm"
				class:active={pattern === 'pixelate'}
				onclick={() => onPatternChange('pixelate')}
				title="Pixelate (P)"
				aria-label="Pixelate effect"
				aria-pressed={pattern === 'pixelate'}
			>
				<iconify-icon icon="mdi:grid" width="18"></iconify-icon>
				<span class="hidden md:inline ml-1">Pixelate</span>
			</button>
		</div>
	</div>

	<div class="divider-vertical hidden lg:block"></div>

	<!-- Strength Slider -->
	<div class="control-group flex-1 min-w-[200px] max-w-[300px]">
		<label class="control-label" for="blur-strength-slider">
			{strengthLabel}:
		</label>
		<div class="flex items-center gap-2">
			<input
				id="blur-strength-slider"
				type="range"
				min={minStrength}
				max={maxStrength}
				step="1"
				value={blurStrength}
				oninput={handleStrengthInput}
				class="range range-primary flex-1"
				aria-label="{strengthLabel} value"
				aria-valuemin={minStrength}
				aria-valuemax={maxStrength}
				aria-valuenow={blurStrength}
			/>
			<span class="badge preset-outlined-surface-500 w-12 text-center text-xs font-mono shrink-0">
				{blurStrength}
			</span>
		</div>
	</div>

	<!-- Line break for mobile -->
	<div class="w-full lg:hidden"></div>

	<div class="divider-vertical hidden lg:block"></div>

	<!-- Transform Controls -->
	<div class="control-group">
		<span class="control-label sr-only">Transform:</span>
		<div class="btn-group-compact">
			<button class="btn btn-icon btn-sm" onclick={onRotateLeft} title="Rotate Left" aria-label="Rotate region left" disabled={!hasActiveRegion}>
				<iconify-icon icon="mdi:rotate-left" width="18"></iconify-icon>
			</button>
			<button class="btn btn-icon btn-sm" onclick={onRotateRight} title="Rotate Right" aria-label="Rotate region right" disabled={!hasActiveRegion}>
				<iconify-icon icon="mdi:rotate-right" width="18"></iconify-icon>
			</button>
			<button
				class="btn btn-icon btn-sm"
				onclick={onFlipHorizontal}
				title="Flip Horizontal"
				aria-label="Flip region horizontally"
				disabled={!hasActiveRegion}
			>
				<iconify-icon icon="mdi:flip-horizontal" width="18"></iconify-icon>
			</button>
		</div>
	</div>

	<!-- Delete Button -->
	<button
		class="btn btn-sm preset-outlined-error-500 shrink-0"
		onclick={onDeleteRegion}
		title="Delete Selected Region (Delete)"
		aria-label="Delete selected region"
		disabled={!hasActiveRegion}
	>
		<iconify-icon icon="mdi:delete" width="18"></iconify-icon>
		<span class="hidden md:inline">Delete</span>
	</button>

	<!-- Spacer -->
	<div class="flex-1 hidden lg:block"></div>

	<!-- Action Buttons -->
	<div class="action-buttons flex gap-2 ml-auto">
		<button onclick={onReset} class="btn btn-sm preset-outlined-surface-500">
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
		padding: 0.75rem;
		background: rgb(var(--color-surface-100) / 1);
		border-top: 1px solid rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .blur-controls {
		background: rgb(var(--color-surface-800) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.control-label {
		font-size: 0.875rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.divider-vertical {
		height: 1.5rem;
		width: 1px;
		background: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .divider-vertical {
		background: rgb(var(--color-surface-600) / 1);
	}

	.btn-group-compact {
		display: flex;
		gap: 0;
		border-radius: 0.5rem;
		overflow: hidden;
		border: 1px solid rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .btn-group-compact {
		border-color: rgb(var(--color-surface-600) / 1);
	}

	.btn-group-compact .btn {
		border-radius: 0;
		border: none;
		border-right: 1px solid rgb(var(--color-surface-300) / 1);
	}

	.btn-group-compact .btn:last-child {
		border-right: none;
	}

	.btn-group-compact .btn.active {
		background: rgb(var(--color-primary-500) / 1);
		color: white;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}

	/* Mobile optimizations */
	@media (max-width: 1024px) {
		.blur-controls {
			padding: 0.5rem;
		}

		.control-label:not(.sr-only) {
			display: none;
		}

		.control-group {
			gap: 0.25rem;
		}
	}
</style>
