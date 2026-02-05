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

	function handleAngleNumber(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		let value = parseInt(target.value, 10) || 0;
		value = Math.max(-180, Math.min(180, value));
		onRotationChange(value);
	}

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
		if (!e?.target || !(e.target as Node).ownerDocument) return;
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
	<!-- Row 1: Tool buttons (rotate, flip, helpers) -->
	<div class="control-row control-row-tools">
		<div class="btn-group">
			<button class="btn" onclick={onRotateLeft} title="Rotate Left 90° (Ctrl+←)">
				<iconify-icon icon="mdi:rotate-left" width="20"></iconify-icon>
			</button>
			<button class="btn" onclick={onRotateRight} title="Rotate Right 90° (Ctrl+→)">
				<iconify-icon icon="mdi:rotate-right" width="20"></iconify-icon>
			</button>
		</div>
		<div class="btn-group">
			<button class="btn" class:active={isFlippedH} onclick={onFlipHorizontal} title="Flip Horizontal (H)">
				<iconify-icon icon="mdi:flip-horizontal" width="20"></iconify-icon>
			</button>
			<button class="btn" class:active={isFlippedV} onclick={onFlipVertical} title="Flip Vertical (V)">
				<iconify-icon icon="mdi:flip-vertical" width="20"></iconify-icon>
			</button>
		</div>
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

	<!-- Row 2: Presets + Slider -->
	<div class="control-row control-row-slider">
		<div class="preset-angles">
			{#each presetAngles as angle}
				<button class="preset-btn" class:active={Math.abs(displayAngle - angle) < 0.5} onclick={() => onRotationChange(angle)}>
					{angle > 0 ? '+' : ''}{angle}°
				</button>
			{/each}
		</div>
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
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.75rem;
		background: rgb(var(--color-surface-100) / 1);
		border-top: 1px solid rgb(var(--color-surface-200) / 1);
		width: 100%;
	}

	:global(.dark) .rotate-controls {
		background: rgb(var(--color-surface-800) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	/* Rows: tools on top, presets + slider below */
	.control-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		width: 100%;
	}

	.control-row-tools {
		flex-shrink: 0;
	}

	.control-row-slider {
		flex: 1;
		min-height: 1.75rem;
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
		flex-shrink: 0;
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

	/* Slider: same as Zoom (h-7 pill, 7rem track, 16px primary thumb) */
	.slider-wrapper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: 1.75rem;
		padding: 0 0.5rem;
		border-radius: 9999px;
		background: rgb(var(--color-surface-50) / 0.05);
		border: 1px solid rgb(var(--color-surface-50) / 0.1);
		width: fit-content;
		min-width: 0;
		flex: 1;
		max-width: 12rem;
	}

	:global(.dark) .slider-wrapper {
		background: rgb(var(--color-surface-50) / 0.05);
		border-color: rgb(var(--color-surface-50) / 0.1);
	}

	.slider-track-container {
		width: 7rem;
		flex-shrink: 0;
		position: relative;
		display: flex;
		align-items: center;
		height: 0.25rem;
	}

	.slider {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 4px;
		border-radius: 9999px;
		background: rgb(var(--color-surface-500) / 0.3);
		outline: none;
		cursor: pointer;
		position: absolute;
		margin: 0;
	}

	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: rgb(var(--color-primary-500) / 1);
		border: 2px solid white;
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		transition: transform 0.1s;
		margin-top: -6px;
	}

	.slider::-webkit-slider-thumb:hover {
		transform: scale(1.05);
	}

	.slider:focus {
		outline: none;
	}

	.slider:focus::-webkit-slider-thumb {
		box-shadow: 0 0 0 3px rgb(var(--color-primary-500) / 0.3), 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.slider::-moz-range-track {
		height: 4px;
		border-radius: 9999px;
		background: rgb(var(--color-surface-500) / 0.3);
	}

	.slider::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: rgb(var(--color-primary-500) / 1);
		border: 2px solid white;
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		transition: transform 0.1s;
	}

	.slider::-moz-range-thumb:hover {
		transform: scale(1.05);
	}

	.center-tick {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 2px;
		height: 8px;
		background: rgb(var(--color-surface-400) / 0.5);
		pointer-events: none;
		border-radius: 1px;
	}

	.angle-display {
		font-family: monospace;
		font-size: 0.75rem;
		font-weight: 600;
		color: rgb(var(--color-primary-500) / 1);
		min-width: 2.5rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	/* Responsive: slider row uses full width */
	@media (max-width: 640px) {
		.control-row-slider {
			flex-direction: column;
			align-items: stretch;
			gap: 0.5rem;
		}

		.preset-angles {
			justify-content: center;
		}

		.slider-wrapper {
			min-width: 100%;
		}
	}
</style>
