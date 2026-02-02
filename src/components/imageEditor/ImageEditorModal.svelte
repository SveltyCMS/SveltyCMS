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

	import { onMount } from 'svelte';

	let {
		image = null,
		watermarkPreset = null,
		onsave = () => {},
		close = () => {}
	}: {
		image: MediaImage | File | string | null;
		/** Optional watermark preset to auto-apply when editing */
		watermarkPreset?: WatermarkOptions | null;
		onsave?: (detail: any) => void;
		close?: () => void;
	} = $props();

	// Computed image source and metadata
	const imageSrc = $derived.by(() => {
		if (!image) return '';
		if (typeof image === 'string') return image;
		if (image instanceof File) return ''; // File will be passed separately
		return (image as MediaImage).url || '';
	});

	// File object to pass to editor (for direct file uploads)
	const imageFile = $derived.by(() => {
		if (image instanceof File) return image;
		return null;
	});

	const initialFocalPoint = $derived.by(() => {
		if (image && typeof image === 'object' && 'metadata' in image) {
			return (image as MediaImage).metadata?.focalPoint as { x: number; y: number } | undefined;
		}
		return undefined;
	});

	const mediaId = $derived.by(() => {
		if (image && typeof image === 'object' && '_id' in image) {
			return (image as MediaImage)._id;
		}
		return undefined;
	});

	$effect(() => {
		console.log('[ImageEditorModal] Props received:', {
			imageType: image ? (image instanceof File ? 'File' : typeof image === 'string' ? 'string' : 'MediaImage') : 'null',
			imageSrc: imageSrc || '(empty)',
			hasFile: !!imageFile,
			mediaId: mediaId || '(none)'
		});
	});

	// Provide watermark preset to child widgets via context
	setContext('watermarkPreset', () => watermarkPreset);

	let editorComponent: Editor | undefined = $state();

	/* Error & Loading States */
	let error = $state<string | null>(null);
	let isSaving = $state(false);
	// Initializing state - use the store to know when image node is ready
	let isInitializing = $state(true);

	$effect(() => {
		if (imageEditorStore.state.imageNode) {
			isInitializing = false;
		}
	});

	function handleSaveError(err: Error) {
		error = `Failed to save: ${err.message}`;
		console.error('[ImageEditorModal] Save error:', err);
		isSaving = false;
	}

	async function handleSaveClick() {
		try {
			isSaving = true;
			error = null;
			await editorComponent?.handleSave();
		} catch (err) {
			handleSaveError(err as Error);
		} finally {
			isSaving = false;
		}
	}

	/* Unsaved Changes */
	const hasUnsavedChanges = $derived(imageEditorStore.canUndoState);

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
		close();
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
	/* Fullscreen & Shortcuts */
	let isFullscreen = $state(false);

	function toggleFullscreen() {
		isFullscreen = !isFullscreen;
	}

	function handleKeyDown(e: KeyboardEvent) {
		const cmdOrCtrl = e.metaKey || e.ctrlKey;

		// Ctrl/Cmd+S: Save
		if (cmdOrCtrl && e.key === 's') {
			e.preventDefault();
			editorComponent?.handleSave();
		}

		// Escape: Close or exit tool
		// Note: The template-level onkeydown for the modal container also handles this,
		// but having it here ensures it's caught even if focus is inside the specific element
		if (e.key === 'Escape') {
			e.preventDefault();
			handleCancelClick();
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	});

	$effect(() => {
		return () => {
			// Clean up blob URLs from both sources
			if (imageSrc && imageSrc.startsWith('blob:')) {
				URL.revokeObjectURL(imageSrc);
			}
			// Also clean up if imageFile was converted to blob
			if (imageFile) {
				const file = imageFile as any;
				if (file._blobUrl) {
					URL.revokeObjectURL(file._blobUrl);
				}
			}
		};
	});
</script>

{#if image}
	<div
		class="relative flex h-full min-h-[500px] w-full flex-col overflow-hidden bg-surface-100 shadow-xl dark:bg-surface-800"
		class:fixed={isFullscreen}
		class:inset-0={isFullscreen}
		class:z-50={isFullscreen}
		role="dialog"
		aria-modal="true"
		aria-labelledby="image-editor-title"
	>
		<!-- Initial Loading Overlay -->
		{#if isInitializing}
			<div class="absolute inset-0 flex items-center justify-center bg-surface-50/80 dark:bg-surface-900/80 z-50">
				<div class="text-center">
					<iconify-icon icon="mdi:loading" width="48" class="animate-spin text-primary-500"></iconify-icon>
					<p class="mt-2 text-sm text-surface-600 dark:text-surface-300">Loading editor...</p>
				</div>
			</div>
		{/if}

		<!-- Error Banner -->
		{#if error}
			<div class="absolute top-16 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4">
				<div class="bg-error-50 border border-error-200 rounded-lg p-4 shadow-lg dark:bg-error-900/90 backdrop-blur-sm">
					<div class="flex items-start gap-3">
						<iconify-icon icon="mdi:alert-circle" width="24" class="text-error-500 shrink-0"></iconify-icon>
						<div class="flex-1">
							<p class="text-sm text-error-700 dark:text-error-100">{error}</p>
						</div>
						<button
							onclick={() => (error = null)}
							class="text-error-400 hover:text-error-600 dark:text-error-200 hover:dark:text-error-50"
							aria-label="Dismiss error"
						>
							<iconify-icon icon="mdi:close" width="20"></iconify-icon>
						</button>
					</div>
				</div>
			</div>
		{/if}

		<header
			class="flex items-center justify-between border-b border-surface-300 p-3 lg:p-4 dark:text-surface-50 bg-surface-100/80 dark:bg-surface-800/80 sticky top-0 z-10 backdrop-blur-sm"
		>
			<div class="flex items-center gap-3 overflow-hidden">
				<!-- Mobile: Show compact title -->
				<div class="sm:hidden">
					{#if activeWidget}
						<iconify-icon icon={activeWidget.icon} width="20" class="text-primary-500"></iconify-icon>
					{:else}
						<span class="text-sm font-semibold">Editor</span>
					{/if}
				</div>

				<!-- Desktop/Tablet: Show full title -->
				<div class="hidden sm:flex items-center gap-3 overflow-hidden">
					{#if activeWidget}
						<div class="flex items-center gap-2 text-primary-500 shrink-0">
							<iconify-icon icon={activeWidget.icon} width="24"></iconify-icon>
						</div>
						<div class="flex flex-col min-w-0">
							<h2 id="image-editor-title" class="text-sm lg:text-lg font-bold truncate leading-tight flex items-center gap-1.5">
								<span>{activeWidget.title}</span>
								{#if subInfo}
									<span class="text-surface-400">:</span>
									<span class="flex items-center gap-1 text-primary-600 dark:text-primary-400 font-extrabold">
										{#if subInfo.icon}
											<iconify-icon icon={subInfo.icon} width="16" class="lg:width-[20px]"></iconify-icon>
										{/if}
										<span>{subInfo.label}</span>
									</span>
								{/if}
							</h2>
						</div>
					{:else}
						<h2 id="image-editor-title" class="text-tertiary-500 dark:text-primary-400 text-lg font-semibold shrink-0 flex items-center gap-2">
							Image Editor
							{#if hasUnsavedChanges}
								<span class="inline-block h-2 w-2 rounded-full bg-warning-500 animate-pulse" title="Unsaved changes"></span>
							{/if}
						</h2>
					{/if}
				</div>
			</div>

			<!-- Global Actions -->
			<div class="flex items-center gap-1 sm:gap-2">
				<!-- Hide undo/redo on mobile to save space -->
				<div class="hidden sm:flex items-center gap-2">
					<button
						onclick={() => editorComponent?.handleUndo()}
						disabled={!imageEditorStore.canUndoState}
						class="btn-icon preset-outlined-surface-500"
						title="Undo (Ctrl+Z)"
						aria-label="Undo"
					>
						<iconify-icon icon="mdi:undo" width="20"></iconify-icon>
					</button>
					<button
						onclick={() => editorComponent?.handleRedo()}
						disabled={!imageEditorStore.canRedoState}
						class="btn-icon preset-outlined-surface-500"
						title="Redo (Ctrl+Shift+Z)"
						aria-label="Redo"
					>
						<iconify-icon icon="mdi:redo" width="20"></iconify-icon>
					</button>
					<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>
				</div>

				<!-- Mobile: Compact buttons -->
				<button onclick={handleCancelClick} class="btn preset-outlined-surface-500 max-sm:btn-sm">
					<span class="max-sm:hidden">{activeState ? 'Exit Tool' : 'Cancel'}</span>
					<span class="sm:hidden">
						<iconify-icon icon="mdi:close" width="16"></iconify-icon>
					</span>
				</button>

				<button onclick={handleSaveClick} disabled={isSaving} class="btn preset-filled-tertiary-500 dark:preset-filled-primary-500 max-sm:btn-sm">
					{#if isSaving}
						<iconify-icon icon="mdi:loading" width="18" class="animate-spin"></iconify-icon>
						<span class="max-sm:hidden">Saving...</span>
					{:else}
						<iconify-icon icon="mdi:content-save" width="18"></iconify-icon>
						<span class="max-sm:hidden">Save</span>
					{/if}
				</button>

				<!-- Desktop only: Close and Fullscreen -->
				<div class="hidden sm:block h-6 w-px bg-surface-300 dark:bg-surface-600"></div>

				<button
					onclick={toggleFullscreen}
					class="btn-icon preset-outlined-surface-500 max-sm:hidden"
					title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
				>
					<iconify-icon icon={isFullscreen ? 'mdi:fullscreen-exit' : 'mdi:fullscreen'} width="20"></iconify-icon>
				</button>

				<button onclick={handleClose} class="btn-icon preset-outlined-surface-500 max-sm:hidden" aria-label="Close">
					<iconify-icon icon="mdi:close" width="24"></iconify-icon>
				</button>
			</div>
		</header>

		<main class="flex-1 overflow-auto bg-surface-50/50 dark:bg-surface-900/50">
			<Editor
				bind:this={editorComponent}
				initialImageSrc={imageSrc}
				{imageFile}
				{mediaId}
				focalPoint={initialFocalPoint}
				onsave={(detail) => onsave(detail)}
				oncancel={handleClose}
			/>
		</main>
		<EditorToolbar />
	</div>
{/if}
