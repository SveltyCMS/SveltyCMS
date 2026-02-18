<!--
@file: src/components/imageEditor/widgets/Crop/Controls.svelte
@component
Modern, responsive crop controls with keyboard shortcuts and accessibility
-->
<script lang="ts">
	import type { CropShape } from './types';

	let {
		onRotateLeft,
		onRotateRight,
		onFlipHorizontal,
		onFlipVertical,
		onCropShapeChange,
		onAspectRatio,
		cropShape
	}: {
		onRotateLeft: () => void;
		onRotateRight: () => void;
		onFlipHorizontal: () => void;
		onFlipVertical?: () => void;
		onCropShapeChange: (shape: CropShape) => void;
		onAspectRatio: (ratio: number | null) => void;
		cropShape: CropShape;
	} = $props();

	// Unused presets removed for Square Only enforcement

	function handleRatio(ratio: number | null) {
		onAspectRatio(ratio);
	}

	// Keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		// Skip if typing in input
		if ((e.target as HTMLElement).tagName === 'INPUT') { return; }

		const cmdOrCtrl = e.metaKey || e.ctrlKey;

		switch (e.key) {
			case 'r':
			case 'R':
				if (!cmdOrCtrl) {
					e.preventDefault();
					onRotateRight();
				}
				break;
			case 'l':
			case 'L':
				if (!cmdOrCtrl) {
					e.preventDefault();
					onRotateLeft();
				}
				break;
			case 'f':
			case 'F':
				if (!cmdOrCtrl) {
					e.preventDefault();
					onFlipHorizontal();
				}
				break;
			// Quick aspect ratio shortcut (square only)
			case '1':
				e.preventDefault();
				handleRatio(1);
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="crop-controls" role="toolbar" aria-label="Crop controls">
	<!-- Group 1: Aspect Ratio Presets (Square Only Enforced) -->
	<div class="control-group">
		<div class="aspect-ratios">
			<!-- Only Square is allowed per requirements -->
			<button class="aspect-btn active" onclick={() => handleRatio(1)} title="Square (1:1)" aria-label="Aspect ratio 1:1" aria-pressed="true">
				<iconify-icon icon="mdi:crop-square" width="16"></iconify-icon>
				<span>Square</span>
			</button>

			<!-- Hidden other ratios for future expansion if needed -->
			<!-- 
			{#each visiblePresets as preset, i}
				...
			{/each}
			-->
		</div>
	</div>

	<!-- Group 2: Tools (Shape & Transform) -->
	<div class="control-group">
		<!-- Shape Selection -->
		<div class="btn-group" role="radiogroup" aria-label="Crop shape">
			<button
				class="btn"
				class:active={cropShape === 'rectangle' || cropShape === 'square'}
				onclick={() => onCropShapeChange('rectangle')}
				title="Rectangle"
			>
				<iconify-icon icon="mdi:crop-landscape" width="20"></iconify-icon>
			</button>
			<button class="btn" class:active={cropShape === 'circular'} onclick={() => onCropShapeChange('circular')} title="Circle">
				<iconify-icon icon="mdi:circle-outline" width="20"></iconify-icon>
			</button>
		</div>

		<!-- Transform Controls -->
		<div class="btn-group">
			<button class="btn" onclick={onRotateLeft} title="Rotate Left 90° (L)"><iconify-icon icon="mdi:rotate-left" width="20"></iconify-icon></button>
			<button class="btn" onclick={onRotateRight} title="Rotate Right 90° (R)">
				<iconify-icon icon="mdi:rotate-right" width="20"></iconify-icon>
			</button>
			<button class="btn" onclick={onFlipHorizontal} title="Flip Horizontal (F)">
				<iconify-icon icon="mdi:flip-horizontal" width="20"></iconify-icon>
			</button>
			{#if onFlipVertical}
				<button class="btn" onclick={onFlipVertical} title="Flip Vertical"><iconify-icon icon="mdi:flip-vertical" width="20"></iconify-icon></button>
			{/if}
		</div>
	</div>

	<!-- Spacer -->
	<div class="flex-1 hidden lg:block"></div>

	<!-- Action Buttons: Handled by global toolbar -->
	<div class="h-2"></div>
</div>

<style>
	.crop-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 0;
		background: transparent;
		border: none;
	}

	.control-group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.aspect-ratios {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.aspect-btn {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		height: 2.25rem;
		padding: 0 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: #9ca3af;
		white-space: nowrap;
		cursor: pointer;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid transparent;
		border-radius: 9999px;
		transition: all 0.2s;
	}

	.aspect-btn:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}

	.aspect-btn.active {
		color: white;
		background: #3b82f6; /* Primary-500 */
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.3);
	}

	.btn-group .btn.active {
		color: white;
		background: #3b82f6;
	}

	/* Mobile optimizations */
	@media (max-width: 1024px) {
		.crop-controls {
			row-gap: 1rem;
		}
	}
</style>
