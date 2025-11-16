<!--
@file src/routes/(app)/imageEditor/components/toolbars/controls/CropControls.sveltee
@component
**Crop tool controls for master toolbar**
Provides inline controls for crop operations.

### Props
- `onRotateLeft`: Function to rotate image -90 degrees
- `onFlipHorizontal`: Function to flip image horizontally
- `cropShape`: Current crop shape (rectangle/square/circular)
- `onCropShapeChange`: Function called when crop shape changes
- `onAspectRatio`: (Optional) Function called when aspect ratio button is clicked
- `onApply`: Function called when Apply button is clicked

### Features:
- Buttons for rotate, flip, and apply actions
- Dropdown for selecting crop shape
- Aspect ratio quick-select buttons (if handler provided)
-->

<script lang="ts">
	let {
		onRotateLeft,
		onFlipHorizontal,
		cropShape,
		onCropShapeChange,
		onAspectRatio,
		onApply
	}: {
		onRotateLeft: () => void;
		onFlipHorizontal: () => void;
		cropShape: 'rectangle' | 'square' | 'circular';
		onCropShapeChange: (shape: 'rectangle' | 'square' | 'circular') => void;
		onAspectRatio?: (ratio: string) => void;
		onApply: () => void;
	} = $props();

	const aspectRatios = [
		{ label: 'Free', value: 'free' },
		{ label: '1:1', value: '1:1' },
		{ label: '4:3', value: '4:3' },
		{ label: '16:9', value: '16:9' }
	];
</script>

<div class="crop-controls flex items-center gap-2">
	<button onclick={onRotateLeft} class="control-btn flex items-center justify-center rounded-lg p-2 transition-colors" title="Rotate left 90°">
		<iconify-icon icon="mdi:rotate-left" width="20"></iconify-icon>
	</button>

	<button onclick={onFlipHorizontal} class="control-btn flex items-center justify-center rounded-lg p-2 transition-colors" title="Flip horizontal">
		<iconify-icon icon="mdi:flip-horizontal" width="20"></iconify-icon>
	</button>

	<div class="divider h-6 w-px"></div>

	<select
		value={cropShape}
		onchange={(e) => onCropShapeChange(e.currentTarget.value as any)}
		class="control-select rounded-lg border-0 px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-primary-500"
	>
		<option value="rectangle">Rectangle</option>
		<option value="square">Square</option>
		<option value="circular">Circle</option>
	</select>

	{#if onAspectRatio && cropShape === 'rectangle'}
		<div class="aspect-group flex items-center gap-1">
			{#each aspectRatios as ratio}
				<button
					onclick={() => onAspectRatio?.(ratio.value)}
					class="aspect-btn rounded px-2.5 py-1 text-xs font-medium transition-colors"
					title={ratio.label}
				>
					{ratio.label}
				</button>
			{/each}
		</div>
	{/if}

	<div class="divider h-6 w-px"></div>

	<button onclick={onApply} class="apply-btn flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors">
		<iconify-icon icon="mdi:check" width="18"></iconify-icon>
		Apply
	</button>
</div>

<style lang="postcss">
	.control-btn {
		background-color: rgb(var(--color-surface-200) / 1);
		color: rgb(var(--color-surface-700) / 1);
	}

	:global(.dark) .control-btn {
		background-color: rgb(var(--color-surface-700) / 1);
		color: rgb(var(--color-surface-200) / 1);
	}

	.control-btn:hover {
		background-color: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .control-btn:hover {
		background-color: rgb(var(--color-surface-600) / 1);
	}

	.control-select {
		background-color: rgb(var(--color-surface-200) / 1);
		color: rgb(var(--color-surface-700) / 1);
	}

	:global(.dark) .control-select {
		background-color: rgb(var(--color-surface-700) / 1);
		color: rgb(var(--color-surface-200) / 1);
	}

	.aspect-btn {
		background-color: rgb(var(--color-surface-200) / 1);
		color: rgb(var(--color-surface-600) / 1);
	}

	:global(.dark) .aspect-btn {
		background-color: rgb(var(--color-surface-700) / 1);
		color: rgb(var(--color-surface-300) / 1);
	}

	.aspect-btn:hover {
		background-color: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .aspect-btn:hover {
		background-color: rgb(var(--color-surface-600) / 1);
	}

	.divider {
		background-color: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .divider {
		background-color: rgb(var(--color-surface-600) / 1);
	}

	.apply-btn {
		background-color: rgb(var(--color-success-500) / 1);
		color: white;
	}

	.apply-btn:hover {
		background-color: rgb(var(--color-success-600) / 1);
	}
</style>
