<!--
@file src/components/imageEditor/toolbars/FocalPointControls.svelte
@component
Toolbar controls for the FocalPoint widget
-->

<script lang="ts">
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		focalX?: number;
		focalY?: number;
		onReset?: () => void;
		onApply?: () => void;
		onCancel?: () => void;
	}

	const { focalX = 50, focalY = 50, onReset = () => {}, onApply = () => {}, onCancel = () => {} }: Props = $props();
</script>

<div class="flex items-center gap-4 flex-wrap">
	<!-- Focal Point Coordinates -->
	<div class="flex items-center gap-2">
		<span class="text-sm font-medium">Focal Point:</span>
		<div class="flex items-center gap-1">
			<span class="badge variant-soft-primary text-xs">X: {focalX}%</span>
			<span class="badge variant-soft-primary text-xs">Y: {focalY}%</span>
		</div>
	</div>

	<!-- Instructions -->
	<span class="text-xs text-surface-600 dark:text-surface-50"> Click on the image to set focal point </span>

	<!-- Spacer -->
	<div class="flex-1"></div>

	<!-- Actions -->
	<div class="flex items-center gap-2">
		<button onclick={onReset} class="btn preset-outlined-surface-500btn-sm" title="Reset to center">
			<CircleQuestionMark size={24} />
			<span>Reset</span>
		</button>

		<button onclick={onCancel} class="btn preset-outlined-error-500 btn-sm" title="Discard changes">
			<X size={18} />
			<span>Cancel</span>
		</button>

		<button onclick={onApply} class="btn preset-filled-primary-500 btn-sm" title="Apply focal point">
			<Check size={18} />
			<span>Apply</span>
		</button>
	</div>
</div>
