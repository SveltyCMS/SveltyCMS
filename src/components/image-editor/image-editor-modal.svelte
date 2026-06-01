<!--
@file: src/components/image-editor/image-editor-modal.svelte
@component
A reusable modal that wraps the main Image Editor.
-->
<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import type { MediaImage, WatermarkOptions } from '@src/utils/media/media-models';
	import { onMount, setContext } from 'svelte';
	import Editor from './editor.svelte';
	import EditorToolbar from './editor-toolbar.svelte';

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
		if (!image) {
			return '';
		}
		if (typeof image === 'string') {
			return image;
		}
		if (image instanceof File) {
			return ''; // File will be passed separately
		}
		return (image as MediaImage).url || '';
	});

	// File object to pass to editor (for direct file uploads)
	const imageFile = $derived.by(() => {
		if (image instanceof File) {
			return image;
		}
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

	const getImageType = (img: any) => {
		if (!img) {
			return 'null';
		}
		if (img instanceof File) {
			return 'File';
		}
		if (typeof img === 'string') {
			return 'string';
		}
		return 'MediaImage';
	};

	$effect(() => {
		console.log('[ImageEditorModal] Props received:', {
			imageType: getImageType(image),
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
		if (imageEditorStore.state.imageElement) {
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
	// Restore UI Logic
	function handleCancelClick() {
		if (!window.confirm('Discard changes? These edits will not be saved.')) {
			return;
		}
		// Cancel always discards draft edits and closes the editor.
		imageEditorStore.reset();
		close?.();
	}

	function handleZoomAction(type: 'in' | 'out' | 'reset') {
		const currentZoom = imageEditorStore.state.zoom;
		if (type === 'in') {
			imageEditorStore.state.zoom = Math.min(5, currentZoom * 1.15);
		} else if (type === 'out') {
			imageEditorStore.state.zoom = Math.max(0.1, currentZoom / 1.15);
		} else {
			imageEditorStore.state.zoom = 1;
			imageEditorStore.state.translateX = 0;
			imageEditorStore.state.translateY = 0;
		}
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
			if (imageSrc?.startsWith('blob:')) {
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
		class="relative flex h-[calc(100dvh-0.75rem)] min-h-[640px] w-full flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,_rgba(31,31,31,0.98),_rgba(12,12,12,0.98))] shadow-[0_28px_90px_rgba(0,0,0,0.45)] md:h-[calc(100dvh-1.5rem)] md:min-h-[720px]"
		role="dialog"
		aria-modal="true"
		aria-label="Image Editor"
	>
		<!-- Initial Loading Overlay -->
		{#if isInitializing}
			<div class="absolute inset-0 flex items-center justify-center bg-surface-900/80 z-50 backdrop-blur-sm">
				<div class="text-center">
					<iconify-icon icon="mdi:loading" width="48" class="animate-spin text-tertiary-500 dark:text-primary-500"></iconify-icon>
					<p class="mt-2 text-sm text-surface-300">Loading editor...</p>
				</div>
			</div>
		{/if}

		<!-- Error Banner -->
		{#if error}
			<div class="absolute top-16 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4">
				<div class="bg-error-900/90 border border-error-700/50 rounded-lg p-4 shadow-lg backdrop-blur-sm">
					<div class="flex items-start gap-3">
						<iconify-icon icon="mdi:alert-circle" width="24" class="text-error-500 shrink-0"></iconify-icon>
						<div class="flex-1">
							<p class="text-sm text-error-100">{error}</p>
						</div>
						<button
							onclick={() => (error = null)}
							class="text-error-500 hover:text-error-600 dark:text-error-200 hover:dark:text-error-50"
							aria-label="Dismiss error"
						>
							<iconify-icon icon="mdi:close" width="20"></iconify-icon>
						</button>
					</div>
				</div>
			</div>
		{/if}

		<main class="relative flex min-h-0 flex-1 overflow-hidden bg-surface-900">
			<Editor
				bind:this={editorComponent}
				initialImageSrc={imageSrc}
				{imageFile}
				{mediaId}
				focalPoint={initialFocalPoint}
				oncancel={handleCancelClick}
				onsave={(detail) => onsave(detail)}
			/>
		</main>
		<EditorToolbar
			onsave={handleSaveClick}
			{isSaving}
			onZoomIn={() => handleZoomAction('in')}
			onZoomOut={() => handleZoomAction('out')}
			onZoomReset={() => handleZoomAction('reset')}
			onCompareToggle={() => imageEditorStore.setCompareMode(!imageEditorStore.state.compareMode)}
			isComparing={!!imageEditorStore.state.compareMode}
		/>
	</div>
{/if}
