<!--
@file src/routes/(app)/imageEditor/components/FocalPointTopToolbar.svelte
@component
Top toolbar for focal point tool with controls

### Props
- `focalPointX`: number - Current focal point X coordinate (relative, -0.5 to 0.5)
- `focalPointY`: number - Current focal point Y coordinate (relative, -0.5 to 0.5)
- `onReset`: () => void - Callback when reset button is clicked
- `onRemove`: () => void - Callback when remove button is clicked
- `onDone`: () => void - Callback when done button is clicked
-->

<script lang="ts">
	interface Props {
		focalPointX: number;
		focalPointY: number;
		onReset: () => void;
		onRemove: () => void;
		onDone: () => void;
	}

	const { focalPointX, focalPointY, onReset, onRemove, onDone } = $props() as Props;
</script>

<div class="focal-point-toolbar">
	<div class="toolbar-content">
		<!-- Focal Point Coordinates Display -->
		<div class="coordinates-display">
			<span class="label">Focal Point:</span>
			<div class="coordinates">
				<span class="coordinate">X: <strong>{focalPointX.toFixed(2)}</strong></span>
				<span class="coordinate">Y: <strong>{focalPointY.toFixed(2)}</strong></span>
			</div>
		</div>

		<!-- Action Buttons -->
		<div class="action-buttons">
			<button onclick={onRemove} class="variant-filled-error btn" aria-label="Remove focal point">
				<iconify-icon icon="mdi:close-circle" width="18"></iconify-icon>
				<span>Remove</span>
			</button>

			<button onclick={onReset} class="variant-soft-surface btn" aria-label="Reset focal point">
				<iconify-icon icon="mdi:refresh" width="18"></iconify-icon>
				<span>Reset</span>
			</button>

			<button onclick={onDone} class="variant-filled-primary btn" aria-label="Apply focal point">
				<iconify-icon icon="mdi:check" width="18"></iconify-icon>
				<span>Done</span>
			</button>
		</div>
	</div>
</div>

<style>
	.focal-point-toolbar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(10px);
		padding: 1rem;
		z-index: 100;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.toolbar-content {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2rem;
		max-width: 100%;
	}

	.coordinates-display {
		display: flex;
		align-items: center;
		gap: 1rem;
		color: white;
		font-size: 0.875rem;
	}

	.label {
		font-weight: 500;
		opacity: 0.8;
	}

	.coordinates {
		display: flex;
		gap: 1.5rem;
	}

	.coordinate {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		opacity: 0.9;
	}

	.coordinate strong {
		font-weight: 600;
		color: #60a5fa;
	}

	.action-buttons {
		display: flex;
		gap: 0.75rem;
	}

	.btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
	}

	.btn:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	.btn:active {
		transform: translateY(0);
	}

	@media (max-width: 768px) {
		.toolbar-content {
			flex-direction: column;
			gap: 1rem;
		}

		.coordinates-display {
			width: 100%;
			justify-content: center;
		}

		.action-buttons {
			width: 100%;
			justify-content: center;
		}

		.btn span {
			display: none;
		}

		.btn {
			padding: 0.5rem;
		}
	}
</style>
