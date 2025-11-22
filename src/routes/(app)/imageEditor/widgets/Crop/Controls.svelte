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
		@apply text-nowrap text-sm font-medium text-surface-700 dark:text-surface-200;
	}
	.divider {
		@apply h-6 w-px bg-surface-300 dark:bg-surface-600;
	}
	.divider-grow {
		@apply flex-grow;
	}
	.btn-tool {
		@apply flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-medium transition-colors;
		@apply bg-surface-200 text-surface-700 dark:bg-surface-700 dark:text-surface-200;
		min-width: 36px;
	}
	.btn-tool:hover {
		@apply bg-surface-300 dark:bg-surface-600;
	}
	.btn-apply {
		@apply flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-white;
		@apply bg-success-500 hover:bg-success-600;
	}
	.segment-group {
		@apply flex items-center rounded-lg bg-surface-200 p-0.5 dark:bg-surface-700;
	}
	.segment-btn {
		@apply rounded-md px-2 py-1 transition-colors;
		@apply text-surface-500 dark:text-surface-400;
	}
	.segment-btn.aspect {
		@apply px-3 text-xs font-medium;
	}
	.segment-btn:hover:not(.active) {
		@apply text-surface-700 dark:text-surface-200;
	}
	.segment-btn.active {
		@apply bg-white text-primary-600 shadow-sm dark:bg-surface-900;
	}
</style>
