<!--
@file: src/routes/(app)/imageEditor/widgets/Crop/Controls.svelte
@component
**Crop tool controls for master toolbar**
-->
<script lang="ts">
	import type { CropShape } from './regions';

	const {
		cropShape,
		aspectRatio,
		onRotateLeft,
		onFlipHorizontal,
		onCropShapeChange,
		onAspectRatioChange,
		onApply
	}: {
		cropShape: CropShape;
		aspectRatio: string;
		onRotateLeft: () => void;
		onFlipHorizontal: () => void;
		onCropShapeChange: (s: CropShape) => void;
		onAspectRatioChange: (r: string) => void;
		onApply: () => void;
	} = $props();

	const aspectRatios = [
		{ label: 'Free', value: 'free' },
		{ label: '1:1', value: '1:1' },
		{ label: '4:3', value: '4:3' },
		{ label: '16:9', value: '16:9' }
	];

	// Derive values for UI binding
	const shapeValue = $derived(cropShape);
	const aspectValue = $derived(aspectRatio);
</script>

<div class="crop-controls">
	<!-- Transform Tools -->
	<button onclick={onRotateLeft} class="btn-tool" title="Rotate left 90°">
		<iconify-icon icon="mdi:rotate-left" width="20"></iconify-icon>
	</button>
	<button onclick={onFlipHorizontal} class="btn-tool" title="Flip horizontal">
		<iconify-icon icon="mdi:flip-horizontal" width="20"></iconify-icon>
	</button>
	<div class="divider"></div>

	<!-- Shape Selector -->
	<span class="label">Shape:</span>
	<div class="segment-group">
		<button
			class="segment-btn"
			class:active={shapeValue === 'rectangle'}
			onclick={() => onCropShapeChange('rectangle')}
			aria-pressed={shapeValue === 'rectangle'}
			title="Rectangle"
		>
			<iconify-icon icon="mdi:crop-square" width="20"></iconify-icon>
		</button>
		<button
			class="segment-btn"
			class:active={shapeValue === 'circular'}
			onclick={() => onCropShapeChange('circular')}
			aria-pressed={shapeValue === 'circular'}
			title="Circle"
		>
			<iconify-icon icon="mdi:circle-outline" width="20"></iconify-icon>
		</button>
	</div>
	<div class="divider"></div>

	<!-- Aspect Ratio Selector -->
	<span class="label">Aspect:</span>
	<div class="segment-group">
		{#each aspectRatios as r}
			<button
				class="segment-btn aspect"
				class:active={aspectValue === r.value}
				onclick={() => onAspectRatioChange(r.value)}
				aria-pressed={aspectValue === r.value}
				title="Aspect ratio {r.label}"
			>
				{r.label}
			</button>
		{/each}
	</div>

	<div class="divider-grow"></div>

	<!-- Actions -->
	<button onclick={onApply} class="btn-apply" title="Apply crop">
		<iconify-icon icon="mdi:check" width="18"></iconify-icon>
		<span>Apply</span>
	</button>
</div>

<style lang="postcss">
@import "tailwindcss";
.crop-controls {
@apply flex w-full items-center gap-3 px-2;
}
.label {
@apply text-nowrap text-sm font-medium;
color: var(--color-surface-700);
}
:global(.dark) .label {
color: var(--color-surface-200);
}
.divider {
@apply h-6 w-px;
background-color: var(--color-surface-300);
}
:global(.dark) .divider {
background-color: var(--color-surface-600);
}
.divider-grow {
@apply flex-grow;
}
.btn-tool {
@apply flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-medium transition-colors;
background-color: var(--color-surface-200);
color: var(--color-surface-700);
min-width: 36px;
}
:global(.dark) .btn-tool {
background-color: var(--color-surface-700);
color: var(--color-surface-200);
}
.btn-tool:hover {
background-color: var(--color-surface-300);
}
:global(.dark) .btn-tool:hover {
background-color: var(--color-surface-600);
}
.btn-apply {
@apply flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-white;
background-color: var(--color-success-500);
}
.btn-apply:hover {
background-color: var(--color-success-600);
}
.segment-group {
@apply flex items-center rounded-lg p-0.5;
background-color: var(--color-surface-200);
}
:global(.dark) .segment-group {
background-color: var(--color-surface-700);
}
.segment-btn {
@apply rounded-md px-2 py-1 transition-colors;
color: var(--color-surface-500);
}
:global(.dark) .segment-btn {
color: var(--color-surface-400);
}
.segment-btn.aspect {
@apply px-3 text-xs font-medium;
}
.segment-btn:hover:not(.active) {
color: var(--color-surface-700);
}
:global(.dark) .segment-btn:hover:not(.active) {
color: var(--color-surface-200);
}
.segment-btn.active {
@apply bg-white shadow-sm;
color: var(--color-primary-600);
}
:global(.dark) .segment-btn.active {
background-color: var(--color-surface-900);
color: var(--color-primary-600);
}
</style>
