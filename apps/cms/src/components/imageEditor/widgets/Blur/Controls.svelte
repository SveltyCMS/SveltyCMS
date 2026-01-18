<!--
@file shared/components/src/imageEditor/toolbars/BlurControls.svelte
@component
Pintura-style controls for the Blur tool with add/delete/rotate/flip functionality.
-->
<script lang="ts">
	import type { BlurPattern, BlurShape } from './regions';

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

<div class="flex w-full items-center gap-3">
	<!-- Add Region -->
	<button class="btn btn-sm preset-filled-primary-500" onclick={onAddRegion} title="Add Blur Region">
		<iconify-icon icon="mdi:plus"></iconify-icon>
		<span class="hidden sm:inline">Add</span>
	</button>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<!-- Shape Selection -->
	<span class="hidden text-sm sm:inline">Shape:</span>
	<div class="btn-group preset-outlined-surface-500">
		<button class="btn-sm" class:active={shape === 'rectangle'} onclick={() => onShapeChange('rectangle')} title="Rectangle">
			<iconify-icon icon="mdi:crop-square"></iconify-icon>
		</button>
		<button class="btn-sm" class:active={shape === 'ellipse'} onclick={() => onShapeChange('ellipse')} title="Ellipse">
			<iconify-icon icon="mdi:circle-outline"></iconify-icon>
		</button>
	</div>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<!-- Pattern Selection -->
	<span class="hidden text-sm sm:inline">Pattern:</span>
	<div class="btn-group preset-outlined-surface-500">
		<button class="btn-sm" class:active={pattern === 'blur'} onclick={() => onPatternChange('blur')} title="Blur">
			<iconify-icon icon="mdi:blur"></iconify-icon>
		</button>
		<button class="btn-sm" class:active={pattern === 'pixelate'} onclick={() => onPatternChange('pixelate')} title="Pixelate">
			<iconify-icon icon="mdi:grid"></iconify-icon>
		</button>
	</div>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<!-- Strength Slider -->
	<label class="flex items-center gap-2 text-sm">
		<span class="hidden sm:inline">{pattern === 'pixelate' ? 'Size:' : 'Strength:'}</span>
		<input
			type="range"
			min="5"
			max={pattern === 'pixelate' ? 50 : 100}
			step="1"
			value={blurStrength}
			oninput={handleStrengthInput}
			class="range range-primary w-24"
		/>
		<span class="w-6 text-right text-xs">{blurStrength}</span>
	</label>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<!-- Transform Controls (Rotate/Flip) - Only enabled when region is active -->
	<div class="btn-group preset-outlined-surface-500">
		<button class="btn btn-icon btn-sm" onclick={onRotateLeft} title="Rotate Region Left" disabled={!hasActiveRegion}>
			<iconify-icon icon="mdi:rotate-left"></iconify-icon>
		</button>
		<button class="btn btn-icon btn-sm" onclick={onRotateRight} title="Rotate Region Right" disabled={!hasActiveRegion}>
			<iconify-icon icon="mdi:rotate-right"></iconify-icon>
		</button>
		<button class="btn btn-icon btn-sm" onclick={onFlipHorizontal} title="Flip Region" disabled={!hasActiveRegion}>
			<iconify-icon icon="mdi:flip-horizontal"></iconify-icon>
		</button>
	</div>

	<!-- Delete Selected Region -->
	<button class="btn btn-sm preset-outlined-error-500" onclick={onDeleteRegion} title="Delete Selected Region" disabled={!hasActiveRegion}>
		<iconify-icon icon="mdi:delete"></iconify-icon>
	</button>

	<div class="grow"></div>

	<!-- Action Buttons -->
	<button onclick={onReset} class="btn btn-sm preset-outlined-surface-500">
		<iconify-icon icon="mdi:restore"></iconify-icon>
		<span class="hidden sm:inline">Reset</span>
	</button>

	<button onclick={onCancel} class="btn btn-sm preset-outlined-error-500">
		<iconify-icon icon="mdi:close"></iconify-icon>
		<span class="hidden sm:inline">Cancel</span>
	</button>

	<button class="btn btn-sm preset-filled-success-500" onclick={onApply}>
		<iconify-icon icon="mdi:check"></iconify-icon>
		<span class="hidden sm:inline">Apply</span>
	</button>
</div>
