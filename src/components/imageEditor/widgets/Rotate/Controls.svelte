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
		if (angle > 180) { angle -= 360; }
		if (angle < -180) { angle += 360; }
		return Math.round(angle * 10) / 10; // Round to 1 decimal
	});

	function handleAngleInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onRotationChange(Number.parseFloat(target.value));
	}

	// Keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).tagName === 'INPUT') { return; }

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
				<button class="btn" onclick={onAutoStraighten} title="Auto-Straighten"><iconify-icon icon="mdi:auto-fix" width="20"></iconify-icon></button>
			{/if}
		</div>
	</div>

	<!-- Group 2: Presets -->
	<div class="control-group">
		<div class="preset-angles">
			{#each presetAngles as angle (angle)}
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
				>
			</div>
			<div class="angle-display">{displayAngle}°</div>
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
		gap: 1rem;
		align-items: center;
		width: 100%;
		padding: 0;
		background: transparent;
		border: none;
	}

	/* Groups of controls */
	.control-group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.btn-group {
		display: flex;
		gap: 2px;
		padding: 2px;
		overflow: hidden;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 9999px;
	}

	.btn-group .btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		color: #9ca3af;
		background: transparent;
		border: none;
		border-radius: 9999px;
		transition: all 0.2s;
	}

	.btn-group .btn:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}

	.btn-group .btn.active {
		color: white;
		background: #3b82f6;
	}

	.btn-group .btn:last-child {
		border-right: none;
	}

	.btn-group .btn.active {
		color: white;
		background: rgb(var(--color-primary-500) / 1);
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
		color: #9ca3af;
		white-space: nowrap;
		cursor: pointer;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid transparent;
		border-radius: 9999px;
		transition: all 0.2s;
	}

	.preset-btn:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}

	.preset-btn.active {
		color: white;
		background: #3b82f6; /* Primary-500 */
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.3);
	}

	/* Enhanced Slider Styling */
	.slider-wrapper {
		display: flex;
		flex: 1;
		gap: 0.75rem;
		align-items: center;
		min-width: 200px;
		padding: 0.25rem 0.75rem;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 9999px;
	}

	.slider-track-container {
		position: relative;
		display: flex;
		flex: 1;
		align-items: center;
		height: 1.5rem;
		padding: 0 0.5rem; /* Add padding for thumb */
	}

	.slider {
		position: absolute;
		width: 100%;
		height: 6px;
		margin: 0;
		-webkit-appearance: none;
		appearance: none;
		cursor: pointer;
		outline: none;
		background: rgb(var(--color-surface-300) / 1);
		border-radius: 3px;
	}

	:global(.dark) .slider {
		background: rgb(var(--color-surface-600) / 1);
	}

	/* Slider Thumb - Webkit */
	.slider::-webkit-slider-thumb {
		width: 20px;
		height: 20px;
		margin-top: -7px; /* Nudge to center if needed, though usually auto-centers on height */
		-webkit-appearance: none;
		appearance: none;
		cursor: pointer;
		background: white;
		border: 2px solid rgb(var(--color-primary-500) / 1);
		border-radius: 50%;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
		transition: transform 0.1s; /* Nudge to center if needed, though usually auto-centers on height */
	}

	.slider::-webkit-slider-thumb:hover {
		box-shadow: 0 0 0 4px rgb(var(--color-primary-500) / 0.2);
		transform: scale(1.1);
	}

	.slider::-webkit-slider-thumb:active {
		background: rgb(var(--color-primary-500) / 1);
		border-color: white;
	}

	/* Slider Thumb - Mozilla */
	.slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		cursor: pointer;
		background: white;
		border: 2px solid rgb(var(--color-primary-500) / 1);
		border-radius: 50%;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
		transition: transform 0.1s;
	}

	.slider::-moz-range-thumb:hover {
		box-shadow: 0 0 0 4px rgb(var(--color-primary-500) / 0.2);
		transform: scale(1.1);
	}

	.slider::-moz-range-thumb:active {
		background: rgb(var(--color-primary-500) / 1);
		border-color: white;
	}

	/* Center tick mark */
	.center-tick {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 2px;
		height: 10px;
		pointer-events: none;
		background: rgb(var(--color-surface-400) / 1);
		border-radius: 1px;
		transform: translate(-50%, -50%);
	}

	.angle-display {
		min-width: 3.5rem;
		font-family: monospace;
		font-size: 0.875rem;
		font-weight: 600;
		color: rgb(var(--color-primary-500) / 1);
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
