<!--
@file: src/routes/(app)/imageEditor/components/layout/ImageEditorHeader.svelte
@component
Compact header for the Image Editor. Uses global layout header area.
Shows editor title, file upload, filename, and actions: Undo, Redo, Cancel, Save.
Optimized for maximum viewing area.
-->
<script lang="ts">
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';

	const canUndo = $derived(imageEditorStore.canUndoState);
	const canRedo = $derived(imageEditorStore.canRedoState);
	const canSave = $derived(!!imageEditorStore.state.file);
	const actions = $derived(imageEditorStore.state.actions || {});
	const currentFile = $derived(imageEditorStore.state.file);

	function handleImageUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			const file = target.files[0];
			// Trigger a custom event that ImageEditor.svelte can listen to
			window.dispatchEvent(new CustomEvent('imageEditorUpload', { detail: { file } }));
		}
	}
</script>

<div class="flex w-full items-center justify-between gap-2 border-b px-3 py-1.5">
	<div class="flex items-center gap-3">
		<div class="flex items-center gap-2">
			<iconify-icon icon="tdesign:image-edit" width="20" class="text-primary-600"></iconify-icon>
			<span class="font-medium">Image Editor</span>
		</div>
		<div class="h-4 w-px bg-surface-300 dark:bg-surface-600"></div>
		<div class="file-upload">
			<input id="image-upload-header" class="sr-only" type="file" accept="image/*" onchange={handleImageUpload} aria-label="Upload image file" />
			<label for="image-upload-header" class="variant-filled-primary btn cursor-pointer">
				<iconify-icon icon="mdi:upload" width="16"></iconify-icon>
				<span class="ml-1">Choose Image</span>
			</label>
		</div>
		{#if currentFile}
			<span class="text-xs text-surface-600 dark:text-surface-400" title={currentFile.name}>
				{currentFile.name.length > 30 ? currentFile.name.substring(0, 27) + '...' : currentFile.name}
			</span>
		{/if}
	</div>
	<div class="flex items-center gap-1">
		<button class="btn-icon" title="Undo (Ctrl+Z)" onclick={() => actions.undo?.()} disabled={!canUndo} aria-label="Undo">
			<iconify-icon icon="mdi:undo" width="24"></iconify-icon>
		</button>
		<button class="btn-icon" title="Redo (Ctrl+Shift+Z)" onclick={() => actions.redo?.()} disabled={!canRedo} aria-label="Redo">
			<iconify-icon icon="mdi:redo" width="24"></iconify-icon>
		</button>
		<div class="mx-1 h-5 w-px bg-surface-300 dark:bg-surface-600"></div>
		<button class="variant-ghost-secondary btn" onclick={() => actions.cancel?.()} aria-label="Cancel">Cancel</button>
		<button class="variant-filled-primary btn" onclick={() => actions.save?.()} disabled={!canSave} aria-label="Save">
			<iconify-icon icon="material-symbols:save" width="18"></iconify-icon>
			<span class="ml-1">Save</span>
		</button>
	</div>
</div>
