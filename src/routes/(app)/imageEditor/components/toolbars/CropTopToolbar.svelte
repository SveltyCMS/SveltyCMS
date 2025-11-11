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

	const { onRotateLeft, onFlipHorizontal, cropShape = $bindable(), onCropShapeChange, onAspectRatio, onDone } = $props() as Props;

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
				{#each aspectRatios as ratio}
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
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding-left: 1rem; padding-right: 1rem;
		padding-top: 0.75rem; padding-bottom: 0.75rem;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(8px);
	}

	.quick-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.action-btn-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
		/* @apply transition-all duration-200; */
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
		/* @apply h-6 w-px; */
		background-color: rgba(255, 255, 255, 0.2);
	}

	.action-btn-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-radius: 0.5rem;
		padding-left: 0.75rem; padding-right: 0.75rem;
		padding-top: 0.5rem; padding-bottom: 0.5rem;
		font-size: 0.875rem; line-height: 1.25rem;
		font-weight: 500;
		background-color: rgba(255, 255, 255, 0.1);
		color: rgb(var(--color-surface-50) / 1);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.aspect-ratio-group {
		display: flex;
		align-items: center;
		border-radius: 0.5rem;
		padding-left: 0.5rem; padding-right: 0.5rem;
		background-color: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.aspect-btn {
		border-radius: 0.25rem;
		font-size: 0.75rem; line-height: 1rem;
		font-weight: 500;
		/* @apply transition-all duration-200; */
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
		border-radius: 0.25rem;
		padding-left: 0.5rem; padding-right: 0.5rem;
		font-size: 0.875rem; line-height: 1.25rem;
		/* @apply border-0 outline-none; */
		background-color: rgba(0, 0, 0, 0.3);
		color: white;
	}

	.shape-select:focus {
		/* @apply ring-2 ring-primary-500; */
	}

	.done-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-radius: 0.5rem;
		padding-left: 1rem; padding-right: 1rem;
		padding-top: 0.5rem; padding-bottom: 0.5rem;
		font-size: 0.875rem; line-height: 1.25rem;
		font-weight: 600;
		/* @apply transition-all duration-200; */
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
