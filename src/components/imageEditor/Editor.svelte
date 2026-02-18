<!--
@file: src/components/imageEditor/Editor.svelte
@component
**Enhanced Image Editor - Svelte 5 Optimized**

Comprehensive image editing interface with svelte-canvas integration.
-->

<script lang="ts">
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import { logger } from '@utils/logger';
	import { onDestroy, onMount } from 'svelte';
	import EditorCanvas from './EditorCanvas.svelte';
	import { editorWidgets } from './widgets/registry';

	interface Props {
		focalPoint?: { x: number; y: number };
		imageFile?: File | null;
		initialImageSrc?: string;
		mediaId?: string;
		onsave?: (detail: { dataURL?: string; file?: File; focalPoint?: any; mediaId?: string; manipulations?: any }) => void;
	}

	let { imageFile = null, initialImageSrc = '', mediaId = '', focalPoint = $bindable({ x: 0.5, y: 0.5 }), onsave = () => {} }: Props = $props();

	// State
	let selectedImage = $state('');
	let containerRef = $state<HTMLDivElement | undefined>(undefined);
	let containerWidth = $state(0);
	let containerHeight = $state(0);
	let initialImageLoaded = $state(false);
	let isProcessing = $state(false);
	let error = $state<string | null>(null);
	let activeToolInstance = $state<any>(null);

	// Derived values
	const storeState = imageEditorStore.state;
	const activeState = $derived(imageEditorStore.state.activeState);
	const hasImage = $derived(!!storeState.imageElement);

	// Active tool component
	const activeToolComponent = $derived.by(() => {
		if (!activeState) { return null; }
		const widget = editorWidgets.find((w) => w.key === activeState);
		return widget?.tool ?? null;
	});

	// Reset load state when image source changes
	let lastLoadedSrc = $state('');
	let lastLoadedFile = $state<File | null>(null);

	$effect(() => {
		const src = initialImageSrc;
		const file = imageFile;
		if (src !== lastLoadedSrc || file !== lastLoadedFile) {
			initialImageLoaded = false;
			selectedImage = '';
		}
	});

	// Cleanup effect for selected image
	$effect(() => {
		return () => {
			if (selectedImage?.startsWith('blob:')) {
				URL.revokeObjectURL(selectedImage);
			}
		};
	});

	// Load initial image effect
	$effect(() => {
		const src = initialImageSrc;
		const file = imageFile;

		if (src !== lastLoadedSrc || file !== lastLoadedFile) {
			initialImageLoaded = false;
		}

		if (!(containerRef && (src || file))) { return; }

		// Wait for container to have size
		if (containerWidth === 0 || containerHeight === 0) {
			const timeoutId = setTimeout(() => {
				if (containerRef && containerRef.clientWidth > 0) {
					containerWidth = containerRef.clientWidth;
					containerHeight = containerRef.clientHeight;
				}
			}, 150);
			return () => clearTimeout(timeoutId);
		}

		if (initialImageLoaded && src === selectedImage && !file) { return; }

		queueMicrotask(() => {
			if (src) {
				selectedImage = src;
				loadImage(src);
				lastLoadedSrc = src;
				lastLoadedFile = null;
			} else if (file) {
				const blobUrl = URL.createObjectURL(file);
				selectedImage = blobUrl;
				loadImage(blobUrl, file);
				lastLoadedSrc = '';
				lastLoadedFile = file;
			}
			initialImageLoaded = true;
		});
	});

	function loadImage(imageSrc: string, file?: File, retryAttempt = 0) {
		let cleanedSrc = imageSrc;
		if (imageSrc.startsWith('/files//files/')) {
			cleanedSrc = imageSrc.replace('/files//files/', '/files/');
		}

		isProcessing = true;
		error = null;

		const img = new Image();
		img.crossOrigin = 'anonymous';

		img.onerror = () => {
			if (retryAttempt < 3) {
				setTimeout(() => loadImage(imageSrc, file, retryAttempt + 1), 1000);
			} else {
				error = 'Failed to load image after 3 attempts';
				isProcessing = false;
			}
		};

		img.onload = () => {
			imageEditorStore.setImageElement(img);
			if (file) { imageEditorStore.setFile(file); }

			// Initial fit
			const containerWidth = containerRef?.clientWidth;
			const containerHeight = containerRef?.clientHeight;
			const scaleX = (containerWidth * 0.8) / img.width;
			const scaleY = (containerHeight * 0.8) / img.height;
			imageEditorStore.state.zoom = Math.min(scaleX, scaleY);

			imageEditorStore.takeSnapshot();
			isProcessing = false;
		};

		img.src = cleanedSrc;
	}

	function handleKeyDown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') { return; }

		if (event.key === 'Escape') {
			imageEditorStore.cancelActiveTool();
			return;
		}

		const cmdOrCtrl = event.metaKey || event.ctrlKey;
		const shift = event.shiftKey;

		if (cmdOrCtrl && !shift && event.key === 'z') {
			event.preventDefault();
			imageEditorStore.undoState();
		} else if (cmdOrCtrl && shift && event.key === 'z') {
			event.preventDefault();
			imageEditorStore.redoState();
		}
	}

	export async function handleSave() {
		const { imageElement, file, rotation, flipH, flipV, crop, filters } = imageEditorStore.state;

		if (!(imageElement && file)) {
			error = 'Nothing to save';
			return;
		}

		isProcessing = true;
		try {
			// Instruction set for server-side Sharp.js baking
			const manipulations = {
				rotation,
				flipH,
				flipV,
				focalPoint: $state.snapshot(focalPoint),
				crop: crop
					? {
							x: Math.max(0, crop.x),
							y: Math.max(0, crop.y),
							width: Math.min(imageElement.width, crop.width),
							height: Math.min(imageElement.height, crop.height)
						}
					: null,
				filters: $state.snapshot(filters)
			};

			const mediaIdFromProp = mediaId;
			const mediaIdFromFile = (file as any)._id;
			const targetMediaId = mediaIdFromFile || mediaIdFromProp;

			if (targetMediaId) {
				// Server-side baking via Sharp.js
				const response = await fetch(`/api/media/manipulate/${targetMediaId}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(manipulations)
				});

				const result = await response.json();
				if (!result.success) { throw new Error(result.error || 'Server-side manipulation failed'); }

				// Return the updated media item data
				onsave(result.data);
			} else {
				// Fallback to client-side blob if no mediaId (e.g. fresh upload not yet in DB)
				const canvas = containerRef?.querySelector('canvas');
				if (!canvas) { throw new Error('Canvas not found'); }

				const dataURL = canvas.toDataURL('image/webp', 0.95);
				const resp = await fetch(dataURL);
				const blob = await resp.blob();
				const timestamp = Date.now();
				const newFileName = `edited-${timestamp}.webp`;
				const editedFile = new File([blob], newFileName, { type: 'image/webp' });

				onsave({
					dataURL,
					file: editedFile,
					focalPoint,
					manipulations
				});
			}
		} catch (err) {
			logger.error('Save error:', err);
			error = `Failed to save image: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			isProcessing = false;
		}
	}

	onMount(() => {
		imageEditorStore.reset();
		window.addEventListener('keydown', handleKeyDown);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeyDown);
		imageEditorStore.reset();
	});
</script>

<div class="image-editor flex h-full w-full flex-col overflow-hidden" role="application" aria-label="Image editor" aria-busy={isProcessing}>
	{#if error}
		<div class="error-banner bg-error-50 border-l-4 border-error-500 p-4 text-error-700 dark:bg-error-900/20 dark:text-error-300" role="alert">
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:alert-circle" width="20"></iconify-icon>
				<span>{error}</span>
				<button onclick={() => (error = null)} class="ml-auto text-error-600 hover:text-error-800" aria-label="Dismiss error">
					<iconify-icon icon="mdi:close" width="18"></iconify-icon>
				</button>
			</div>
		</div>
	{/if}

	{#if isProcessing}
		<div class="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
			<div class="text-white flex flex-col items-center gap-2">
				<iconify-icon icon="mdi:loading" class="animate-spin text-primary-500" width="48"></iconify-icon>
				<p class="font-medium">Processing image...</p>
			</div>
		</div>
	{/if}

	<div class="editor-main flex min-w-0 flex-1 flex-col">
		<div class="canvas-wrapper relative flex flex-1 flex-col">
			<EditorCanvas bind:containerRef bind:containerWidth bind:containerHeight {hasImage} isLoading={isProcessing} activeTool={activeToolInstance}>
				{#if hasImage}
					{#if activeToolComponent}
						{@const Component = activeToolComponent}
						<Component bind:this={activeToolInstance} onCancel={() => imageEditorStore.cancelActiveTool()} />
					{/if}
				{/if}
			</EditorCanvas>
		</div>
	</div>
</div>
