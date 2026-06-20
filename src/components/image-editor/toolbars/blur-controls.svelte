<!--
@file: src/components/image-editor/toolbars/BlurControls.svelte
@component
Pintura-style controls for the Blur tool with responsive design and keyboard support.
-->
<script lang="ts">
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import type { BlurPattern, BlurShape } from '../widgets/blur/types';

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
		onStrengthChange(Number.parseInt(target.value, 10));
	}

	// Keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		if (e.target && (e.target as HTMLElement).tagName === 'INPUT') {
			return;
		}

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
	<Button variant="tertiary"
		onclick={onAddRegion}
		title="Add Blur Region (Click on image)"
		aria-label="Add blur region"
	 size="sm" class="shrink-0">
		<iconify-icon icon="mdi:plus" width="18"></iconify-icon>
		<span class="hidden sm:inline">Add Region</span>
	</Button>

	<!-- Region Count Badge -->
	{#if regionCount > 0}
		<Badge variant="surface" class="text-xs shrink-0">
			{regionCount}
			{regionCount === 1 ? 'region' : 'regions'}
		</Badge>
	{/if}

	<div class="divider-vertical"></div>

	<!-- Shape Selection -->
	<div class="control-group">
		<span class="control-label">Shape:</span>
		<div class="btn-group-compact" role="radiogroup" aria-label="Blur shape">
			<Button variant="outline"
				onclick={() => onShapeChange('rectangle')}
				title="Rectangle (R)"
				aria-label="Rectangle shape"
				aria-pressed={shape === 'rectangle'}
			 size="sm">
				<iconify-icon icon="mdi:crop-square" width="18"></iconify-icon>
				<span class="sr-only">Rectangle</span>
			</Button>
			<Button variant="outline"
				onclick={() => onShapeChange('ellipse')}
				title="Ellipse (E)"
				aria-label="Ellipse shape"
				aria-pressed={shape === 'ellipse'}
			 size="sm">
				<iconify-icon icon="mdi:circle-outline" width="18"></iconify-icon>
				<span class="sr-only">Ellipse</span>
			</Button>
		</div>
	</div>

	<div class="divider-vertical"></div>

	<!-- Pattern Selection -->
	<div class="control-group">
		<span class="control-label">Effect:</span>
		<div class="btn-group-compact" role="radiogroup" aria-label="Blur pattern">
			<Button variant="outline"
				onclick={() => onPatternChange('blur')}
				title="Blur (B)"
				aria-label="Blur effect"
				aria-pressed={pattern === 'blur'}
			 size="sm">
				<iconify-icon icon="mdi:blur" width="18"></iconify-icon>
				<span class="hidden md:inline ms-1">Blur</span>
			</Button>
			<Button variant="outline"
				onclick={() => onPatternChange('pixelate')}
				title="Pixelate (P)"
				aria-label="Pixelate effect"
				aria-pressed={pattern === 'pixelate'}
			 size="sm">
				<iconify-icon icon="mdi:grid" width="18"></iconify-icon>
				<span class="hidden md:inline ms-1">Pixelate</span>
			</Button>
		</div>
	</div>

	<div class="divider-vertical hidden lg:block"></div>

	<!-- Strength Slider -->
	<div class="control-group flex-1 min-w-50 max-w-75">
		<label class="control-label" for="blur-strength-slider"> {strengthLabel}: </label>
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
			<Badge variant="outline" class="w-12 text-center text-xs font-mono shrink-0"> {blurStrength} </Badge>
		</div>
	</div>

	<!-- Line break for mobile -->
	<div class="w-full lg:hidden"></div>

	<div class="divider-vertical hidden lg:block"></div>

	<!-- Transform Controls -->
	<div class="control-group">
		<span class="control-label sr-only">Transform:</span>
		<div class="btn-group-compact">
			<Button variant="ghost" onclick={onRotateLeft} title="Rotate Left" aria-label="Rotate region left" disabled={!hasActiveRegion} size="sm" class="p-0! min-w-0">
				<iconify-icon icon="mdi:rotate-left" width="18"></iconify-icon>
			</Button>
			<Button variant="ghost" onclick={onRotateRight} title="Rotate Right" aria-label="Rotate region right" disabled={!hasActiveRegion} size="sm" class="p-0! min-w-0">
				<iconify-icon icon="mdi:rotate-right" width="18"></iconify-icon>
			</Button>
			<Button variant="ghost"
				onclick={onFlipHorizontal}
				title="Flip Horizontal"
				aria-label="Flip region horizontally"
				disabled={!hasActiveRegion}
			 size="sm" class="p-0! min-w-0">
				<iconify-icon icon="mdi:flip-horizontal" width="18"></iconify-icon>
			</Button>
		</div>
	</div>

	<!-- Delete Button -->
	<Button variant="error"
		onclick={onDeleteRegion}
		title="Delete Selected Region (Delete)"
		aria-label="Delete selected region"
		disabled={!hasActiveRegion}
	 size="sm" class="shrink-0">
		<iconify-icon icon="mdi:delete" width="18"></iconify-icon>
		<span class="hidden md:inline">Delete</span>
	</Button>

	<!-- Spacer -->
	<div class="flex-1 hidden lg:block"></div>

	<!-- Action Buttons -->
	<div class="action-buttons flex gap-2 ml-auto">
		<Button variant="outline" onclick={onReset} aria-label="Reset blur" size="sm">
			<iconify-icon icon="mdi:restore" width="18"></iconify-icon>
			<span class="hidden sm:inline">Reset</span>
		</Button>

		<Button variant="error" onclick={onCancel} aria-label="Cancel blur" size="sm">
			<iconify-icon icon="mdi:close" width="18"></iconify-icon>
			<span class="hidden sm:inline">Cancel</span>
		</Button>

		<Button variant="success" onclick={onApply} aria-label="Apply blur" size="sm">
			<iconify-icon icon="mdi:check" width="18"></iconify-icon>
			<span class="hidden sm:inline">Apply</span>
		</Button>
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
		gap: 0.5rem;
		align-items: center;
	}

	.control-label {
		font-size: 0.875rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.divider-vertical {
		width: 1px;
		height: 1.5rem;
		background: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .divider-vertical {
		background: rgb(var(--color-surface-600) / 1);
	}

	.btn-group-compact {
		display: flex;
		gap: 0;
		overflow: hidden;
		border: 1px solid rgb(var(--color-surface-300) / 1);
		border-radius: 0.5rem;
	}

	:global(.dark) .btn-group-compact {
		border-color: rgb(var(--color-surface-600) / 1);
	}


	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		white-space: nowrap;
		border-width: 0;
		clip: rect(0, 0, 0, 0);
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
