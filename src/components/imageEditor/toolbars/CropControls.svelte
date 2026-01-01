<!--
@file: src/components/imageEditor/toolbars/CropControls.svelte
@component
Modern controls for the Crop tool. Injected into the master toolbar.
-->
<script lang="ts">
	let {
		onRotateLeft,
		onRotateRight,
		onFlipHorizontal,
		onCropShapeChange,
		onAspectRatio,
		onApply,
		onCancel,
		cropShape
	}: {
		onRotateLeft: () => void;
		onRotateRight: () => void;
		onFlipHorizontal: () => void;
		onCropShapeChange: (shape: 'rectangle' | 'circular') => void;
		onAspectRatio: (ratio: number | null) => void;
		onApply: () => void;
		onCancel: () => void;
		cropShape: 'rectangle' | 'circular';
	} = $props();
</script>

<div class="flex items-center gap-3">
	<!-- Aspect Ratio Presets -->
	<div class="btn-group variant-ghost-surface">
		<button class="btn btn-sm" onclick={() => onAspectRatio(null)}>Free</button>
		<button class="btn btn-sm" onclick={() => onAspectRatio(1)}>1:1</button>
		<button class="btn btn-sm" onclick={() => onAspectRatio(16 / 9)}>16:9</button>
		<button class="btn btn-sm" onclick={() => onAspectRatio(4 / 3)}>4:3</button>
	</div>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<!-- Shape -->
	<div class="btn-group variant-ghost-surface">
		<button class="btn btn-sm" class:active={cropShape === 'rectangle'} onclick={() => onCropShapeChange('rectangle')} title="Rectangle">
			<iconify-icon icon="mdi:rectangle-outline"></iconify-icon>
		</button>
		<button class="btn btn-sm" class:active={cropShape === 'circular'} onclick={() => onCropShapeChange('circular')} title="Circle">
			<iconify-icon icon="mdi:circle-outline"></iconify-icon>
		</button>
	</div>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<!-- Rotate & Flip -->
	<button class="btn btn-icon btn-sm variant-ghost-surface" onclick={onRotateLeft} title="Rotate Left">
		<iconify-icon icon="mdi:rotate-left"></iconify-icon>
	</button>
	<button class="btn btn-icon btn-sm variant-ghost-surface" onclick={onRotateRight} title="Rotate Right">
		<iconify-icon icon="mdi:rotate-right"></iconify-icon>
	</button>
	<button class="btn btn-icon btn-sm variant-ghost-surface" onclick={onFlipHorizontal} title="Flip Horizontal">
		<iconify-icon icon="mdi:flip-horizontal"></iconify-icon>
	</button>

	<div class="grow"></div>

	<!-- Cancel -->
	<button class="btn variant-ghost-error" onclick={onCancel}>
		<iconify-icon icon="mdi:close"></iconify-icon>
		<span>Cancel</span>
	</button>

	<!-- Apply -->
	<button class="btn variant-filled-success" onclick={onApply}>
		<iconify-icon icon="mdi:check"></iconify-icon>
		<span>Apply Crop</span>
	</button>
</div>
