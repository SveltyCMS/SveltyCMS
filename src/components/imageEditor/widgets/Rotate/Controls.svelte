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
		onSnapToggle,
		onReset,
		onCancel,
		onApply
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
		onReset: () => void;
		onCancel: () => void;
		onApply: () => void;
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

	function handleAngleNumber(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		let value = parseFloat(target.value) || 0;
		value = Math.max(-180, Math.min(180, value));
		onRotationChange(value);
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
	<div class="actions">
		<button
			class="btn btn-sm preset-outlined-surface-500 hidden sm:flex"
			onclick={onReset}
			disabled={displayAngle === 0 && !isFlippedH && !isFlippedV}
			title="Reset"
		>
			<iconify-icon icon="mdi:restore" width="18"></iconify-icon>
			<span class="hidden lg:inline">Reset</span>
		</button>

		<div class="flex gap-2">
			<button class="btn btn-sm preset-outlined-error-500" onclick={onCancel}>
				<iconify-icon icon="mdi:close" width="18"></iconify-icon>
				<span class="hidden sm:inline">Cancel</span>
			</button>

			<button class="btn btn-sm preset-filled-success-500" onclick={onApply}>
				<iconify-icon icon="mdi:check" width="18"></iconify-icon>
				<span class="sm:inline">Apply</span>
			</button>
		</div>
	</div>
</div>

<style>
	.rotate-controls {
		display: flex;
		flex-wrap: wrap; /* Always allow wrapping */
		align-items: center;
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

	/* Groups of controls */
	.control-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	/* Individual sections within groups */
	.control-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.control-label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgb(var(--color-surface-500) / 1);
		white-space: nowrap;
	}

	:global(.dark) .control-label {
		color: rgb(var(--color-surface-400) / 1);
	}

	.btn-group {
		display: flex;
		gap: 0;
		border-radius: 0.375rem;
		overflow: hidden;
		border: 1px solid rgb(var(--color-surface-300) / 1);
		background: rgb(var(--color-surface-50) / 1);
	}

	:global(.dark) .btn-group {
		border-color: rgb(var(--color-surface-600) / 1);
		background: rgb(var(--color-surface-700) / 1);
	}

	.btn-group .btn {
		border-radius: 0;
		border: none;
		border-right: 1px solid rgb(var(--color-surface-300) / 1);
		height: 2rem;
		width: 2rem;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
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
		border: 1px solid rgb(var(--color-surface-300) / 1);
		border-radius: 0.375rem;
		background: rgb(var(--color-surface-50) / 1);
		color: rgb(var(--color-surface-700) / 1);
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
	}

	:global(.dark) .preset-btn {
		background: rgb(var(--color-surface-700) / 1);
		border-color: rgb(var(--color-surface-600) / 1);
		color: rgb(var(--color-surface-200) / 1);
	}

	.preset-btn:hover {
		border-color: rgb(var(--color-primary-400) / 1);
		background: rgb(var(--color-surface-100) / 1);
	}

	:global(.dark) .preset-btn:hover {
		background: rgb(var(--color-surface-600) / 1);
	}

	.preset-btn.active {
		background: rgb(var(--color-primary-500) / 1);
		border-color: rgb(var(--color-primary-500) / 1);
		color: white;
	}

	/* Enhanced Slider Styling */
	.slider-wrapper {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 240px; /* Ensure decent width */
		background: rgb(var(--color-surface-50) / 0.5);
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		border: 1px solid rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .slider-wrapper {
		background: rgb(var(--color-surface-900) / 0.5);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.slider-track-container {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
		height: 1.5rem;
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

	.divider {
		width: 1px;
		height: 1.5rem;
		background: rgb(var(--color-surface-300) / 1);
		flex-shrink: 0;
	}

	:global(.dark) .divider {
		background: rgb(var(--color-surface-600) / 1);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-shrink: 0;
		margin-left: auto;
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

		.actions {
			margin-left: 0;
			width: 100%;
			justify-content: flex-end;
			border-top: 1px solid rgb(var(--color-surface-200) / 0.5);
			padding-top: 0.75rem;
		}
	}
</style>
