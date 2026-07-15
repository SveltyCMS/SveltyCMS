<!--
@file src/plugins/focal-point/components/focal-point-editor-tool.svelte
@component
**Image Editor Focal Point Tool — injected into image_editor_tool Slot zone**

Adds a "Focal Point" button to the image editor toolbar. When clicked,
opens the AspectPreviewModal for the current image being edited.
-->

<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import AspectPreviewModal from '@components/media/aspect-preview-modal.svelte';
	import 'iconify-icon';

	let showPreview = $state(false);

	const imageUrl = $derived(imageEditorStore.state.imageElement?.src ?? '');
	const currentFocalPoint = $derived(imageEditorStore.state.focalPoint);
</script>

<button
	type="button"
	class="inline-flex items-center justify-center size-[--editor-control-h] cursor-pointer bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-[--editor-radius-control] transition-[background,color,border-color] duration-150 text-[--editor-chrome-text] hover:text-[--editor-chrome-text-hover] hover:bg-white/10"
	onclick={() => { showPreview = true; }}
	title="Focal Point & Aspect Preview"
	aria-label="Open focal point and aspect ratio preview"
>
	<iconify-icon icon="mdi:crosshairs-gps" width="18" aria-hidden="true"></iconify-icon>
</button>

{#if showPreview && imageUrl}
	<AspectPreviewModal
		media={{
			url: imageUrl,
			filename: 'Image being edited',
			metadata: currentFocalPoint ? { focalPoint: currentFocalPoint } : undefined,
		}}
		show={showPreview}
		onClose={() => { showPreview = false; }}
	/>
{/if}
