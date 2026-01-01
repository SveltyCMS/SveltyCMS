<!--
@file: src/components/imageEditor/ImageEditorModal.svelte
@component
A reusable modal that wraps the main Image Editor.
-->
<script lang="ts">
	import type { MediaImage, WatermarkOptions } from '@src/utils/media/mediaModels';
	import { setContext } from 'svelte';
	import Editor from './Editor.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import { editorWidgets } from './widgets/registry';

	let {
		show = $bindable(),
		image = null,
		watermarkPreset = null,
		onsave = () => {}
	}: {
		show: boolean;
		image: MediaImage | null;
		/** Optional watermark preset to auto-apply when editing */
		watermarkPreset?: WatermarkOptions | null;
		onsave?: (detail: any) => void;
	} = $props();

	// Provide watermark preset to child widgets via context
	setContext('watermarkPreset', () => watermarkPreset);

	let editorComponent: Editor | undefined = $state();

	const activeState = $derived(imageEditorStore.state.activeState);
	const activeWidget = $derived(editorWidgets.find((w: any) => w.key === activeState));

	// For Fine-Tune, we want to show the specific adjustment (e.g. contrast)
	// We'll peek into the toolbar props if available
	const subInfo = $derived.by(() => {
		if (activeState === 'finetune') {
			const props = imageEditorStore.state.toolbarControls?.props;
			if (props?.activeAdjustment) {
				// Capitalize first letter
				const adj = props.activeAdjustment;
				return {
					label: adj.charAt(0).toUpperCase() + adj.slice(1),
					icon: props.activeIcon
				};
			}
		}
		return null;
	});

	function handleClose() {
		if (imageEditorStore.canUndoState) {
			if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
				return;
			}
		}
		show = false; // Directly mutate the bindable prop
	}

	function handleCancelClick() {
		// If a tool is active, exit the tool first
		if (activeState) {
			imageEditorStore.cleanupToolSpecific(activeState);
			imageEditorStore.setActiveState('');
		} else {
			// No tool active, ask for confirmation if dirty
			if (imageEditorStore.canUndoState) {
				if (!confirm('You have unsaved changes. Are you sure you want to discard them?')) {
					return;
				}
			}
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
			<header
				class="flex items-center justify-between border-b border-surface-300 p-3 lg:p-4 dark:border-surface-700 bg-surface-100/80 dark:bg-surface-800/80 sticky top-0 z-10"
			>
				<div class="flex items-center gap-3 overflow-hidden">
					{#if activeWidget}
						<div class="flex items-center gap-2 text-primary-500 shrink-0">
							<iconify-icon icon={activeWidget.icon} width="24" class="max-sm:width-[20px]"></iconify-icon>
						</div>
						<div class="flex flex-col min-w-0">
							<h2 id="image-editor-title" class="text-sm lg:text-lg font-bold truncate leading-tight flex items-center gap-1.5">
								<span class="max-sm:hidden">{activeWidget.title}</span>
								{#if subInfo}
									<span class="max-sm:hidden text-surface-400">:</span>
									<span class="flex items-center gap-1 text-primary-600 dark:text-primary-400 font-extrabold">
										{#if subInfo.icon}
											<iconify-icon icon={subInfo.icon} width="16" class="lg:width-[20px]"></iconify-icon>
										{/if}
										<span>{subInfo.label}</span>
									</span>
								{:else}
									<span class="sm:hidden">{activeWidget.title}</span>
								{/if}
							</h2>
						</div>
					{:else}
						<h2 id="image-editor-title" class="text-lg font-semibold shrink-0">Image Editor</h2>
					{/if}
				</div>

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
					focalPoint={image?.metadata?.focalPoint as { x: number; y: number } | undefined}
					onsave={(detail) => onsave(detail)}
					oncancel={handleClose}
				/>
			</main>
			<EditorToolbar />
		</div>
	</div>
{/if}
