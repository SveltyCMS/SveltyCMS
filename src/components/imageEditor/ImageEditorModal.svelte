<!--
@file: src/components/imageEditor/ImageEditorModal.svelte
@component
A reusable modal that wraps the main Image Editor.
-->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { MediaImage } from '@src/utils/media/mediaModels';
	import Editor from './Editor.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';

	const dispatch = createEventDispatcher();

	let {
		show = $bindable(),
		image = null
	}: {
		show: boolean;
		image: MediaImage | null;
	} = $props();

	let editorComponent: Editor | undefined = $state();

	const activeState = $derived(imageEditorStore.state.activeState);

	function handleClose() {
		show = false; // Directly mutate the bindable prop
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

{#if show && image}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="image-editor-title"
		tabindex="-1"
		onkeydown={(e) => {
			if (e.key === 'Escape') handleClose();
		}}
	>
		<div
			class="fixed inset-0"
			onclick={handleClose}
			role="button"
			tabindex="0"
			aria-label="Close modal"
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					handleClose();
				}
			}}
		></div>

		<div class="relative flex h-[90vh] w-[90vw] max-w-7xl flex-col rounded-lg bg-surface-100 shadow-xl dark:bg-surface-800">
			<header class="flex items-center justify-between border-b border-surface-300 p-4 dark:border-surface-700">
				<h2 id="image-editor-title" class="text-lg font-semibold">Image Editor</h2>
				
				<!-- Global Actions -->
				<div class="flex items-center gap-2">
					<button
						onclick={() => editorComponent?.handleUndo()}
						disabled={!imageEditorStore.canUndoState}
						class="btn-icon variant-ghost-surface"
						title="Undo (Ctrl+Z)"
						aria-label="Undo"
					>
						<iconify-icon icon="mdi:undo" width="20"></iconify-icon>
					</button>
					<button
						onclick={() => editorComponent?.handleRedo()}
						disabled={!imageEditorStore.canRedoState}
						class="btn-icon variant-ghost-surface"
						title="Redo (Ctrl+Shift+Z)"
						aria-label="Redo"
					>
						<iconify-icon icon="mdi:redo" width="20"></iconify-icon>
					</button>
					<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>
					<button onclick={handleCancelClick} class="btn variant-ghost-surface">
						{activeState ? 'Exit Tool' : 'Cancel'}
					</button>
					<button onclick={() => editorComponent?.handleSave()} class="btn variant-filled-success">
						<iconify-icon icon="mdi:content-save" width="18"></iconify-icon>
						<span>Save</span>
					</button>
					<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>
					<button onclick={handleClose} class="btn-icon variant-ghost-surface" aria-label="Close">
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
					on:save={(e) => dispatch('save', e.detail)}
					on:cancel={handleClose}
				/>
			</main>
			<EditorToolbar {editorComponent} />
		</div>
	</div>
{/if}
