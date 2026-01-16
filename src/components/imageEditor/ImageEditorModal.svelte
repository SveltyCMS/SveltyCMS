<!--
@file: src/components/imageEditor/ImageEditorModal.svelte
@component
A reusable modal that wraps the main Image Editor.
-->
<script lang="ts">
	import type { MediaImage } from '@src/utils/media/mediaModels';
	import Editor from './Editor.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import { m } from '$paraglide/messages';

	let {
		image = null,
		onsave = () => {},
		close
	}: {
		image: MediaImage | null;
		onsave?: (detail: any) => void;
		close?: () => void;
	} = $props();

	let editorComponent: Editor | undefined = $state();

	const activeState = $derived(imageEditorStore.state.activeState);

	function handleClose() {
		close?.();
	}

	function handleCancelClick() {
		// If a tool is active, exit the tool first
		if (activeState) {
			imageEditorStore.cleanupToolSpecific(activeState);
			imageEditorStore.setActiveState('');
		} else {
			// No tool active, close the editor
			handleClose();
		}
	}
</script>

{#if image}
	<div class="relative flex h-[90vh] w-full max-w-7xl flex-col rounded-lg bg-surface-100 shadow-xl dark:bg-surface-800">
		<header class="flex items-center justify-between border-b border-surface-300 p-4 dark:border-surface-700">
			<h2 id="image-editor-title" class="text-lg font-semibold">Image Editor</h2>

			<!-- Global Actions -->
			<div class="flex items-center gap-2">
				<button
					onclick={() => editorComponent?.handleUndo()}
					disabled={!imageEditorStore.canUndoState}
					class="btn-icon preset-ghost-surface-500"
					title="Undo (Ctrl+Z)"
					aria-label="Undo"
				>
					<iconify-icon icon="mdi:undo" width="20"></iconify-icon>
				</button>
				<button
					onclick={() => editorComponent?.handleRedo()}
					disabled={!imageEditorStore.canRedoState}
					class="btn-icon preset-ghost-surface-500"
					title="Redo (Ctrl+Shift+Z)"
					aria-label="Redo"
				>
					<iconify-icon icon="mdi:redo" width="20"></iconify-icon>
				</button>
				<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>
				<button onclick={handleCancelClick} class="btn preset-ghost-surface-500">
					{activeState ? 'Exit Tool' : m.button_cancel()}
				</button>
				<button onclick={() => editorComponent?.handleSave()} class="btn preset-filled-success-500">
					<iconify-icon icon="mdi:content-save" width="18"></iconify-icon>
					<span>{m.button_save()}</span>
				</button>
				<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>
				<button onclick={handleClose} class="btn-icon preset-ghost-surface-500" aria-label="Close">
					<iconify-icon icon="mdi:close" width="24"></iconify-icon>
				</button>
			</div>
		</header>

		<main class="flex-1 overflow-auto bg-surface-50/50 dark:bg-surface-900/50">
			<Editor
				bind:this={editorComponent}
				initialImageSrc={image.url}
				mediaId={image._id}
				focalPoint={image?.metadata?.focalPoint as { x: number; y: number } | undefined}
				onsave={(detail) => onsave(detail)}
				oncancel={handleClose}
			/>
		</main>
		<EditorToolbar />
	</div>
{/if}
