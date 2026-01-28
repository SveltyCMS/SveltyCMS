<!--
@file: src/components/imageEditor/widgets/Rotate/Controls.svelte
@component
Controls for the Rotate tool.
Fully responsive with flex-wrap and mobile-friendly touch targets.
-->
<script lang="ts">
	let {
		rotationAngle,
		onRotateLeft,
		onRotateRight,
		onRotationChange,
		onFlipHorizontal,
		onFlipVertical,
		onReset,
		onCancel,
		onApply
	}: {
		rotationAngle: number;
		onRotateLeft: () => void;
		onRotateRight: () => void;
		onRotationChange: (angle: number) => void;
		onFlipHorizontal: () => void;
		onFlipVertical: () => void;
		onReset: () => void;
		onCancel: () => void;
		onApply: () => void;
	} = $props();

	function handleAngleInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onRotationChange(parseInt(target.value, 10));
	}

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
		return Math.round(angle);
	});
</script>

<div class="rotate-controls flex flex-wrap items-center justify-center gap-2 px-2 overflow-x-auto">
	<!-- Rotate Controls -->
	<div class="flex items-center gap-1 shrink-0">
		<span class="text-xs text-surface-500 dark:text-surface-400 hidden sm:inline mr-1">Rotate:</span>
		<button class="btn-icon preset-outlined-surface-500 h-8 w-8" onclick={onRotateLeft} title="Rotate Left 90°" aria-label="Rotate left 90 degrees">
			<iconify-icon icon="mdi:rotate-left" width="18"></iconify-icon>
		</button>
		<button
			class="btn-icon preset-outlined-surface-500 h-8 w-8"
			onclick={onRotateRight}
			title="Rotate Right 90°"
			aria-label="Rotate right 90 degrees"
		>
			<iconify-icon icon="mdi:rotate-right" width="18"></iconify-icon>
		</button>
	</div>

	<!-- Divider -->
	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600 hidden sm:block shrink-0"></div>

	<!-- Fine-tune Angle Slider -->
	<div class="flex items-center gap-2 shrink-0">
		<span class="text-xs text-surface-500 dark:text-surface-400 hidden md:inline">Angle:</span>
		<input
			type="range"
			min="-180"
			max="180"
			step="1"
			value={rotationAngle}
			oninput={handleAngleInput}
			class="slider h-1.5 w-20 sm:w-28 md:w-36 cursor-pointer appearance-none rounded-lg bg-surface-300 accent-primary-500 dark:bg-surface-600"
			aria-label="Fine-tune rotation angle"
		/>
		<div class="flex items-center gap-1">
			<input
				type="number"
				min="-180"
				max="180"
				value={displayAngle}
				onchange={handleAngleNumber}
				class="input w-14 px-1 py-0.5 text-center text-sm"
				aria-label="Rotation angle in degrees"
			/>
			<span class="text-xs text-surface-500 dark:text-surface-400">°</span>
		</div>
	</div>

	<!-- Divider -->
	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600 hidden sm:block shrink-0"></div>

	<!-- Flip Controls -->
	<div class="flex items-center gap-1 shrink-0">
		<span class="text-xs text-surface-500 dark:text-surface-400 hidden sm:inline mr-1">Flip:</span>
		<button class="btn-icon preset-outlined-surface-500 h-8 w-8" onclick={onFlipHorizontal} title="Flip Horizontal" aria-label="Flip horizontally">
			<iconify-icon icon="mdi:flip-horizontal" width="18"></iconify-icon>
		</button>
		<button class="btn-icon preset-outlined-surface-500 h-8 w-8" onclick={onFlipVertical} title="Flip Vertical" aria-label="Flip vertically">
			<iconify-icon icon="mdi:flip-vertical" width="18"></iconify-icon>
		</button>
	</div>

	<!-- Spacer on larger screens -->
	<div class="hidden sm:block grow"></div>

	<!-- Action Buttons -->
	<div class="flex items-center gap-2 shrink-0">
		<!-- Reset -->
		<button onclick={onReset} class="btn preset-outlined-surface-500 gap-1 px-3 py-1.5 text-sm" aria-label="Reset rotation">
			<iconify-icon icon="mdi:restore" width="16"></iconify-icon>
			<span class="hidden sm:inline">Reset</span>
		</button>

		<!-- Cancel -->
		<button class="btn preset-outlined-error-500 gap-1 px-3 py-1.5 text-sm" onclick={onCancel} aria-label="Cancel rotation">
			<iconify-icon icon="mdi:close" width="16"></iconify-icon>
			<span class="hidden sm:inline">Cancel</span>
		</button>

		<!-- Apply -->
		<button class="btn preset-filled-success-500 gap-1 px-3 py-1.5 text-sm" onclick={onApply} aria-label="Apply rotation">
			<iconify-icon icon="mdi:check" width="16"></iconify-icon>
			<span class="hidden sm:inline">Apply</span>
		</button>
	</div>
</div>

<style>
	.rotate-controls {
		max-width: 100%;
	}

	/* Custom slider styling */
	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: rgb(var(--color-primary-500));
		cursor: pointer;
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: rgb(var(--color-primary-500));
		cursor: pointer;
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	/* Ensure touch targets are at least 44px on mobile */
	@media (max-width: 640px) {
		.btn-icon {
			min-width: 40px;
			min-height: 40px;
		}
	}
</style>
