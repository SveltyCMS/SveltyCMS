<!--
@file shared/components/src/imageEditor/widgets/FocalPoint/Controls.svelte
@component
Toolbar controls for the FocalPoint widget
-->

<script lang="ts">
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
			<iconify-icon icon="mdi:restore" width="18"></iconify-icon>
			<span>Reset</span>
		</button>

		<button onclick={onCancel} class="btn preset-outlined-error-500 btn-sm" title="Discard changes">
			<iconify-icon icon="mdi:close" width="18"></iconify-icon>
			<span>Cancel</span>
		</button>

		<button onclick={onApply} class="btn preset-filled-primary-500 btn-sm" title="Apply focal point">
			<iconify-icon icon="mdi:check" width="18"></iconify-icon>
			<span>Apply</span>
		</button>
	</div>
</div>
