<!--
@file: src/components/imageEditor/toolbars/RotateControls.svelte
@component
Controls for the Rotate tool
-->
<script lang="ts">
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';

	let {
		rotationAngle,
		onRotateLeft,
		onRotateRight,
		onRotationChange,
		onFlipHorizontal,
		onFlipVertical,
		onReset,
		onApply
	}: {
		rotationAngle: number;
		onRotateLeft: () => void;
		onRotateRight: () => void;
		onRotationChange: (angle: number) => void;
		onFlipHorizontal: () => void;
		onFlipVertical: () => void;
		onReset: () => void;
		onApply: () => void;
	} = $props();

	function handleAngleInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onRotationChange(parseInt(target.value, 10));
	}

	// Normalize angle to -180 to 180 for display
	const displayAngle = $derived(() => {
		let angle = rotationAngle % 360;
		if (angle > 180) angle -= 360;
		if (angle < -180) angle += 360;
		return Math.round(angle);
	});
</script>

<div class="flex w-full items-center gap-4">
	<span class="text-sm font-medium">Rotate & Flip Image</span>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<!-- Rotate Controls -->
	<div class="flex items-center gap-2">
		<span class="text-sm">Rotate:</span>
		<button class="btn btn-icon btn-sm preset-outlined-surface-500" onclick={onRotateLeft} title="Rotate Left 90°">
			<CircleQuestionMark size={24} />
		</button>
		<button class="btn btn-icon btn-sm preset-outlined-surface-500" onclick={onRotateRight} title="Rotate Right 90°">
			<CircleQuestionMark size={24} />
		</button>
	</div>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<!-- Fine-tune Angle -->
	<label class="flex items-center gap-2 text-sm">
		<span>Angle:</span>
		<input type="range" min="-180" max="180" step="1" value={rotationAngle} oninput={handleAngleInput} class="range range-primary w-32" />
		<span class="w-12 text-right">{displayAngle()}°</span>
	</label>

	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

	<!-- Flip Controls -->
	<div class="flex items-center gap-2">
		<span class="text-sm">Flip:</span>
		<button class="btn btn-icon btn-sm preset-outlined-surface-500" onclick={onFlipHorizontal} title="Flip Horizontal">
			<CircleQuestionMark size={24} />
		</button>
		<button class="btn btn-icon btn-sm preset-outlined-surface-500" onclick={onFlipVertical} title="Flip Vertical">
			<CircleQuestionMark size={24} />
		</button>
	</div>

	<div class="grow"></div>

	<!-- Actions -->
	<button onclick={onReset} class="btn preset-outlined-surface-500">
		<CircleQuestionMark size={24} />
		<span>Reset</span>
	</button>

	<button class="btn preset-filled-success-500" onclick={onApply}>
		<Check />
		<span>Apply</span>
	</button>
</div>
