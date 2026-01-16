<!--
@file: src/components/imageEditor/toolbars/BlurControls.svelte
@component
Controls for the Blur tool, including strength slider and pattern/shape selectors.
-->
<script lang="ts">
	import type { BlurPattern, BlurShape } from '@src/components/imageEditor/widgets/Blur/regions';

	let {
		blurStrength,
		shape,
		pattern,
		onStrengthChange,
		onShapeChange,
		onPatternChange,
		onReset,
		onApply
	}: {
		blurStrength: number;
		shape: BlurShape;
		pattern: BlurPattern;
		onStrengthChange: (value: number) => void;
		onShapeChange: (value: BlurShape) => void;
		onPatternChange: (value: BlurPattern) => void;
		onReset: () => void;
		onApply: () => void;
	} = $props();

	function handleStrengthInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onStrengthChange(parseInt(target.value, 10));
	}
</script>

<div class="flex w-full items-center gap-4">
	<span class="text-sm font-medium">Click image to add blur region</span>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<span class="text-sm">Shape:</span>
	<div class=" preset-ghost-surface-500">
		<button class="btn btn-sm" class:active={shape === 'rectangle'} onclick={() => onShapeChange('rectangle')} title="Rectangle">
			<iconify-icon icon="mdi:crop-square"></iconify-icon>
		</button>
		<button class="btn btn-sm" class:active={shape === 'ellipse'} onclick={() => onShapeChange('ellipse')} title="Ellipse">
			<iconify-icon icon="mdi:circle-outline"></iconify-icon>
		</button>
	</div>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<span class="text-sm">Pattern:</span>
	<div class=" preset-ghost-surface-500">
		<button class="btn btn-sm" class:active={pattern === 'blur'} onclick={() => onPatternChange('blur')} title="Blur">
			<iconify-icon icon="mdi:blur"></iconify-icon>
		</button>
		<button class="btn btn-sm" class:active={pattern === 'pixelate'} onclick={() => onPatternChange('pixelate')} title="Pixelate">
			<iconify-icon icon="mdi:grid"></iconify-icon>
		</button>
	</div>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<label class="flex items-center gap-2 text-sm">
		<span>{pattern === 'pixelate' ? 'Size:' : 'Strength:'}</span>
		<input
			type="range"
			min="5"
			max={pattern === 'pixelate' ? 50 : 100}
			step="1"
			value={blurStrength}
			oninput={handleStrengthInput}
			class="range range-primary w-32"
		/>
		<span class="w-8 text-right">{blurStrength}</span>
	</label>

	<div class="grow"></div>

	<button onclick={onReset} class="btn preset-ghost-surface-500">
		<iconify-icon icon="mdi:restore"></iconify-icon>
		<span>Reset All</span>
	</button>

	<button class="btn preset-filled-success-500" onclick={onApply}>
		<iconify-icon icon="mdi:check"></iconify-icon>
		<span>Apply Blur</span>
	</button>
</div>
