<!--
@file src/routes/(app)/imageEditor/CropTopToolbar.svelte
@component
**Crop tool top toolbar - Pintura-style inline controls**
Displays quick action buttons for crop operations without blocking the canvas.

### Props
- `onRotateLeft`: Function to rotate image -90 degrees
- `onFlipHorizontal`: Function to flip image horizontally
- `cropShape`: Current crop shape (rectangle/square/circular)
- `onCropShapeChange`: Function called when crop shape changes
- `onDone`: Function called when Done button is clicked
-->

<script lang="ts">
	interface Props {
		onRotateLeft: () => void;
		onFlipHorizontal: () => void;
		cropShape: 'rectangle' | 'square' | 'circular';
		onCropShapeChange: (shape: 'rectangle' | 'square' | 'circular') => void;
		onAspectRatio?: (ratio: string) => void;
		onDone: () => void;
	}

	let { onRotateLeft, onFlipHorizontal, cropShape, onCropShapeChange, onAspectRatio, onDone }: Props = $props();

	// Common aspect ratios
	const aspectRatios = [
		{ label: 'Free', value: 'free' },
		{ label: '1:1', value: '1:1' },
		{ label: '4:3', value: '4:3' },
		{ label: '16:9', value: '16:9' },
		{ label: '3:2', value: '3:2' },
		{ label: '9:16', value: '9:16' }
	];

	function handleShapeChange(e: Event) {
		const select = e.target as HTMLSelectElement;
		onCropShapeChange(select.value as 'rectangle' | 'square' | 'circular');
	}
</script>

<div class="crop-top-toolbar">
	<!-- Quick action buttons -->
	<div class="quick-actions">
		<button onclick={onRotateLeft} class="action-btn-icon" title="Rotate left 90°" aria-label="Rotate left 90°">
			<iconify-icon icon="mdi:rotate-left" width="22"></iconify-icon>
		</button>

		<button onclick={onFlipHorizontal} class="action-btn-icon" title="Flip horizontal" aria-label="Flip horizontal">
			<iconify-icon icon="mdi:flip-horizontal" width="22"></iconify-icon>
		</button>

		<div class="divider"></div>

		<div class="action-btn-group">
			<iconify-icon icon="mdi:crop" width="18"></iconify-icon>
			<select value={cropShape} onchange={handleShapeChange} class="shape-select" title="Crop shape">
				<option value="rectangle">Rectangle</option>
				<option value="square">Square</option>
				<option value="circular">Circular</option>
			</select>
		</div>

		{#if onAspectRatio && cropShape === 'rectangle'}
			<div class="aspect-ratio-group">
				{#each aspectRatios as ratio (ratio.label)}
					<button
						onclick={() => onAspectRatio?.(ratio.value)}
						class="aspect-btn"
						title="Aspect ratio {ratio.label}"
						aria-label="Aspect ratio {ratio.label}"
					>
						{ratio.label}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Done button -->
	<button onclick={onDone} class="done-btn">
		<iconify-icon icon="mdi:check" width="18"></iconify-icon>
		Done
	</button>
</div>

<style>
	.crop-top-toolbar {
		@apply absolute left-0 right-0 top-0 z-40;
		@apply flex items-center justify-center;
		@apply gap-4 px-4 py-3;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(8px);
	}

	.quick-actions {
		@apply flex items-center gap-2;
	}

	.action-btn-icon {
		@apply flex items-center justify-center;
		@apply h-10 w-10 rounded-lg;
		@apply transition-all duration-200;
		background-color: rgba(255, 255, 255, 0.1);
		color: rgb(var(--color-surface-50) / 1);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.action-btn-icon:hover {
		background-color: rgba(255, 255, 255, 0.2);
		transform: scale(1.05);
	}

	.action-btn-icon:active {
		transform: scale(0.95);
	}

	.divider {
		@apply h-6 w-px;
		background-color: rgba(255, 255, 255, 0.2);
	}

	.action-btn-group {
		@apply flex items-center gap-2;
		@apply rounded-lg px-3 py-2;
		@apply text-sm font-medium;
		background-color: rgba(255, 255, 255, 0.1);
		color: rgb(var(--color-surface-50) / 1);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.aspect-ratio-group {
		@apply flex items-center gap-1;
		@apply rounded-lg px-2 py-1;
		background-color: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.aspect-btn {
		@apply rounded px-2.5 py-1 text-xs font-medium;
		@apply transition-all duration-200;
		background-color: rgba(255, 255, 255, 0.1);
		color: rgb(var(--color-surface-50) / 1);
	}

	.aspect-btn:hover {
		background-color: rgba(255, 255, 255, 0.2);
	}

	.aspect-btn:active {
		background-color: rgba(255, 255, 255, 0.3);
	}

	.shape-select {
		@apply rounded px-2 py-1 text-sm;
		@apply border-0 outline-none;
		background-color: rgba(0, 0, 0, 0.3);
		color: white;
	}

	.shape-select:focus {
		@apply ring-2 ring-primary-500;
	}

	.done-btn {
		@apply flex items-center gap-2;
		@apply rounded-lg px-4 py-2;
		@apply text-sm font-semibold;
		@apply transition-all duration-200;
		background-color: rgb(250, 204, 21);
		color: rgb(30, 30, 30);
	}

	.done-btn:hover {
		background-color: rgb(234, 179, 8);
	}

	.done-btn:active {
		transform: scale(0.98);
	}
</style>
