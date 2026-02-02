<!--
@file: src/components/imageEditor/widgets/Rotate/Controls.svelte
@component
Professional rotate controls with straighten and snap features
-->
<script lang="ts">
	let {
		rotationAngle,
		isFlippedH = false,
		isFlippedV = false,
		showGrid = false,
		snapToAngles = true,
		onRotateLeft,
		onRotateRight,
		onRotationChange,
		onFlipHorizontal,
		onFlipVertical,
		onStraighten,
		onAutoStraighten,
		onGridToggle,
		onSnapToggle
	}: {
		rotationAngle: number;
		isFlippedH?: boolean;
		isFlippedV?: boolean;
		showGrid?: boolean;
		snapToAngles?: boolean;
		onRotateLeft: () => void;
		onRotateRight: () => void;
		onRotationChange: (angle: number) => void;
		onFlipHorizontal: () => void;
		onFlipVertical: () => void;
		onStraighten?: () => void;
		onAutoStraighten?: () => void;
		onGridToggle?: () => void;
		onSnapToggle?: () => void;
	} = $props();

	// Preset angles
	const presetAngles = [-90, 0, 90, 180];

	// Normalize angle to -180 to 180 for display
	const displayAngle = $derived.by(() => {
		let angle = rotationAngle % 360;
		if (angle > 180) angle -= 360;
		if (angle < -180) angle += 360;
		return Math.round(angle * 10) / 10; // Round to 1 decimal
	});

	function handleAngleInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onRotationChange(parseFloat(target.value));
	}

	// Keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).tagName === 'INPUT') return;

		const cmdOrCtrl = e.metaKey || e.ctrlKey;

		switch (e.key) {
			case 'ArrowLeft':
				e.preventDefault();
				if (e.shiftKey) {
					onRotationChange(rotationAngle - 0.1);
				} else if (cmdOrCtrl) {
					onRotateLeft();
				} else {
					onRotationChange(rotationAngle - 1);
				}
				break;
			case 'ArrowRight':
				e.preventDefault();
				if (e.shiftKey) {
					onRotationChange(rotationAngle + 0.1);
				} else if (cmdOrCtrl) {
					onRotateRight();
				} else {
					onRotationChange(rotationAngle + 1);
				}
				break;
			case 'h':
			case 'H':
				e.preventDefault();
				onFlipHorizontal();
				break;
			case 'v':
			case 'V':
				e.preventDefault();
				onFlipVertical();
				break;
			case 'g':
			case 'G':
				if (onGridToggle) {
					e.preventDefault();
					onGridToggle();
				}
				break;
			case 's':
			case 'S':
				if (onStraighten && !cmdOrCtrl) {
					e.preventDefault();
					onStraighten();
				}
				break;
			case '0':
				e.preventDefault();
				onRotationChange(0);
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="rotate-controls" role="toolbar" aria-label="Rotate controls">
	<!-- Group 1: Tools (Toggles & Actions) -->
	<div class="control-group">
		<!-- Quick Rotate -->
		<div class="btn-group">
			<button class="btn" onclick={onRotateLeft} title="Rotate Left 90° (Ctrl+←)">
				<iconify-icon icon="mdi:rotate-left" width="20"></iconify-icon>
			</button>
			<button class="btn" onclick={onRotateRight} title="Rotate Right 90° (Ctrl+→)">
				<iconify-icon icon="mdi:rotate-right" width="20"></iconify-icon>
			</button>
		</div>

		<!-- Flip -->
		<div class="btn-group">
			<button class="btn" class:active={isFlippedH} onclick={onFlipHorizontal} title="Flip Horizontal (H)">
				<iconify-icon icon="mdi:flip-horizontal" width="20"></iconify-icon>
			</button>
			<button class="btn" class:active={isFlippedV} onclick={onFlipVertical} title="Flip Vertical (V)">
				<iconify-icon icon="mdi:flip-vertical" width="20"></iconify-icon>
			</button>
		</div>

		<!-- Helpers -->
		<div class="btn-group">
			{#if onGridToggle}
				<button class="btn" class:active={showGrid} onclick={onGridToggle} title="Toggle Grid (G)">
					<iconify-icon icon="mdi:grid" width="20"></iconify-icon>
				</button>
			{/if}
			{#if onSnapToggle}
				<button class="btn" class:active={snapToAngles} onclick={onSnapToggle} title="Snap to Angles">
					<iconify-icon icon="mdi:magnet" width="20"></iconify-icon>
				</button>
			{/if}
			{#if onStraighten}
				<button class="btn" onclick={onStraighten} title="Straighten (S)">
					<iconify-icon icon="mdi:image-filter-center-focus-weak" width="20"></iconify-icon>
				</button>
			{/if}
			{#if onAutoStraighten}
				<button class="btn" onclick={onAutoStraighten} title="Auto-Straighten">
					<iconify-icon icon="mdi:auto-fix" width="20"></iconify-icon>
				</button>
			{/if}
		</div>
	</div>

	<!-- Group 2: Presets -->
	<div class="control-group">
		<div class="preset-angles">
			{#each presetAngles as angle}
				<button class="preset-btn" class:active={Math.abs(displayAngle - angle) < 0.5} onclick={() => onRotationChange(angle)}>
					{angle > 0 ? '+' : ''}{angle}°
				</button>
			{/each}
		</div>
	</div>

	<!-- Group 3: Slider (Refined) -->
	<div class="control-group flex-1">
		<div class="slider-wrapper">
			<div class="slider-track-container">
				<div class="center-tick"></div>
				<input
					id="rotate-slider"
					type="range"
					min="-180"
					max="180"
					step={snapToAngles ? '15' : '0.1'}
					value={rotationAngle}
					oninput={handleAngleInput}
					class="slider"
					aria-label="Fine-tune rotation angle"
				/>
			</div>
			<div class="angle-display">
				{displayAngle}°
			</div>
		</div>
	</div>

	<!-- Actions -->
	<!-- Actions removed: Handled by global toolbar -->
	<div class="h-2"></div>
</div>

<style>
	.rotate-controls {
		display: flex;
		flex-wrap: wrap; /* Always allow wrapping */
		align-items: center;
		gap: 1rem;
		padding: 0;
		background: transparent;
		border: none;
		width: 100%;
	}

	/* Groups of controls */
	.control-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.btn-group {
		display: flex;
		border-radius: 9999px;
		overflow: hidden;
		background: rgba(0, 0, 0, 0.2);
		padding: 2px;
		gap: 2px;
	}

	.btn-group .btn {
		border-radius: 9999px;
		border: none;
		height: 2rem;
		width: 2rem;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		color: #9ca3af;
		transition: all 0.2s;
	}

	.btn-group .btn:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}

	.btn-group .btn.active {
		background: #3b82f6;
		color: white;
	}

	.btn-group .btn:last-child {
		border-right: none;
	}

	.btn-group .btn.active {
		background: rgb(var(--color-primary-500) / 1);
		color: white;
	}

	.preset-angles {
		display: flex;
		gap: 0.25rem;
	}

	.preset-btn {
		height: 2rem;
		padding: 0 0.75rem;
		font-size: 0.75rem;
		font-weight: 600;
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.05);
		color: #9ca3af;
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
		border: 1px solid transparent;
	}

	.preset-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.preset-btn.active {
		background: #3b82f6; /* Primary-500 */
		color: white;
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.3);
	}

	/* Enhanced Slider Styling */
	.slider-wrapper {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 200px;
		background: rgba(0, 0, 0, 0.2);
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.slider-track-container {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
		height: 1.5rem;
		padding: 0 0.5rem; /* Add padding for thumb */
	}

	.slider {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 6px;
		border-radius: 3px;
		background: rgb(var(--color-surface-300) / 1);
		outline: none;
		cursor: pointer;
		position: absolute;
		margin: 0;
	}

	:global(.dark) .slider {
		background: rgb(var(--color-surface-600) / 1);
	}

	/* Slider Thumb - Webkit */
	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: white;
		border: 2px solid rgb(var(--color-primary-500) / 1);
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
		transition: transform 0.1s;
		margin-top: -7px; /* Nudge to center if needed, though usually auto-centers on height */
	}

	.slider::-webkit-slider-thumb:hover {
		transform: scale(1.1);
		box-shadow: 0 0 0 4px rgb(var(--color-primary-500) / 0.2);
	}

	.slider::-webkit-slider-thumb:active {
		background: rgb(var(--color-primary-500) / 1);
		border-color: white;
	}

	/* Slider Thumb - Mozilla */
	.slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: white;
		border: 2px solid rgb(var(--color-primary-500) / 1);
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
		transition: transform 0.1s;
	}

	.slider::-moz-range-thumb:hover {
		transform: scale(1.1);
		box-shadow: 0 0 0 4px rgb(var(--color-primary-500) / 0.2);
	}

	.slider::-moz-range-thumb:active {
		background: rgb(var(--color-primary-500) / 1);
		border-color: white;
	}

	/* Center tick mark */
	.center-tick {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 2px;
		height: 10px;
		background: rgb(var(--color-surface-400) / 1);
		pointer-events: none;
		border-radius: 1px;
	}

	.angle-display {
		font-family: monospace;
		font-size: 0.875rem;
		font-weight: 600;
		color: rgb(var(--color-primary-500) / 1);
		min-width: 3.5rem;
		text-align: right;
	}

	/* Responsive Breakpoints */
	@media (max-width: 1024px) {
		/* Tablet/Mobile: Stack the main sections */
		.rotate-controls {
			row-gap: 1rem;
		}

		/* Make slider row full width */
		.control-group:last-of-type {
			width: 100%;
		}

		.slider-wrapper {
			width: 100%;
		}
	}
</style>
