<!--
@file src/components/image-editor/toolbars/FocalPointControls.svelte
@component
Toolbar controls for the FocalPoint widget
-->

<script lang="ts">
	interface Props {
		focalX?: number;
		focalY?: number;
		onReset?: () => void;
	}

	const { focalX = 50, focalY = 50, onReset = () => {} }: Props = $props();
</script>

<div class="flex items-center gap-4 flex-wrap">
	<!-- Focal Point Coordinates -->
	<div class="flex items-center gap-2">
		<span class="text-sm font-medium">Focal Point:</span>
		<div class="flex items-center gap-1">
			<span class="badge preset-soft-primary-500 text-xs">X: {focalX}%</span>
			<span class="badge preset-soft-primary-500 text-xs">Y: {focalY}%</span>
		</div>
	</div>

	<!-- Instructions -->
	<span class="text-xs text-surface-600 dark:text-surface-50"> Click on the image to set focal point </span>

	<!-- Spacer -->
	<div class="grow"></div>

	<!-- Actions: Only Reset remains, Cancel/Apply handled by global toolbar -->
	<div class="flex items-center gap-2">
		<button onclick={onReset} class="btn preset-outlined-surface-500 btn-sm" title="Reset to center">
			<iconify-icon icon="mdi:restore" width="18"></iconify-icon>
			<span>Reset</span>
		</button>
	</div>
</div>
