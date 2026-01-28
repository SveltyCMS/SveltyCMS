<!--
@file: src/components/imageEditor/Editor.svelte
@component
**Enhanced Image Editor - Svelte 5 Optimized**

Comprehensive image editing interface with Konva.js integration.

@example
<Editor 
  initialImageSrc={image.url}
  mediaId={image._id}
  {onsave}
  {oncancel}
/>

### Props
- `imageFile` (File): Image file object
- `initialImageSrc` (string): Initial image URL
- `mediaId` (string): Media ID for saving
- `focalPoint` (object): Initial focal point coordinates
- `onsave` (function): Save callback
- `oncancel` (function): Cancel callback

### Features
- Full Konva.js integration
- Undo/redo support with history
- Multiple editing tools (crop, filters, text, shapes)
- Keyboard shortcuts
- Responsive canvas
- AVIF/WebP export
- Accessibility compliant
- Error boundaries
-->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { logger } from '@utils/logger';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';

	// import EditorSidebar from './EditorSidebar.svelte'; // Removed for unified layout
	import EditorCanvas from './EditorCanvas.svelte';

	import Konva from 'konva';
	import { editorWidgets } from './widgets/registry';

	interface Props {
		imageFile?: File | null;
		initialImageSrc?: string;
		mediaId?: string; // Added missing mediaId
		focalPoint?: { x: number; y: number };
		onsave?: (detail: { dataURL: string; file: File; focalPoint?: any; mediaId?: string }) => void;
		oncancel?: () => void;
	}

	const {
		imageFile = null,
		initialImageSrc = '',
		mediaId = '', // Added missing mediaId
		focalPoint = { x: 50, y: 50 },
		onsave = () => {},
		oncancel = () => {}
	}: Props = $props();

	// State
	let selectedImage = $state('');
	let containerRef = $state<HTMLDivElement | undefined>(undefined);
	let containerWidth = $state(0);
	let containerHeight = $state(0);
	let initialImageLoaded = $state(false);
	let isProcessing = $state(false);
	let error = $state<string | null>(null);
	let preToolSnapshot = $state<string | null>(null);

	// Derived values
	const storeState = imageEditorStore.state;
	const activeState = $derived(imageEditorStore.state.activeState);
	const hasImage = $derived(!!storeState.imageNode);

	// Active tool component
	const activeToolComponent = $derived.by(() => {
		if (!activeState) return null;

		const widget = editorWidgets.find((w) => w.key === activeState);
		if (widget?.tool) return widget.tool;

		if (activeState === 'focalpoint') return null; // Handled separately

		logger.warn(`Tool not found for state: ${activeState}`);
		return null;
	});

	// Cleanup effect for selected image
	$effect(() => {
		return () => {
			if (selectedImage && selectedImage.startsWith('blob:')) {
				URL.revokeObjectURL(selectedImage);
			}
		};
	});

	// Load initial image effect - handles race conditions with modal animations
	$effect(() => {
		// Use local variables to track what we're loading
		const src = initialImageSrc;
		const file = imageFile;

		// Skip if nothing to load
		if (!containerRef || (!src && !file)) return;
		
		// Wait for container to have size before initializing (modal might be animating)
		// Use a small delay to ensure the modal has finished its animation
		if (containerWidth === 0 || containerHeight === 0) {
			console.log('[Editor] Waiting for container size...', { containerWidth, containerHeight, hasContainerRef: !!containerRef });
			// Schedule a re-check after a short delay for modal animation
			const timeoutId = setTimeout(() => {
				// Force a re-check by updating a tracked value
				if (containerRef && containerRef.clientWidth > 0) {
					containerWidth = containerRef.clientWidth;
					containerHeight = containerRef.clientHeight;
				}
			}, 100);
			return () => clearTimeout(timeoutId);
		}

		// Skip if already loaded with same source
		if (initialImageLoaded && src === selectedImage && !file) return;

		console.log('[Editor] Loading image:', { src: src || '(empty)', hasFile: !!file, containerWidth, containerHeight });

		// Schedule loading after a microtask to ensure DOM is ready
		queueMicrotask(() => {
			if (src) {
				selectedImage = src;
				loadImageAndSetupKonva(src);
			} else if (file) {
				const blobUrl = URL.createObjectURL(file);
				selectedImage = blobUrl;
				loadImageAndSetupKonva(blobUrl, file);
			}
			initialImageLoaded = true;
		});
	});

	// Load image and setup Konva
	function loadImageAndSetupKonva(imageSrc: string, file?: File) {
		console.log('[Editor] loadImageAndSetupKonva called:', { imageSrc, hasFile: !!file });
		
		// CRITICAL: Validate and clean the URL to prevent double /files/ prefix
		let cleanedSrc = imageSrc;
		if (imageSrc.startsWith('/files//files/')) {
			console.warn('[Editor] Detected double /files/ prefix, fixing URL');
			cleanedSrc = imageSrc.replace('/files//files/', '/files/');
		}
		console.log('[Editor] Final image URL:', cleanedSrc);
		
		if (!containerRef) {
			logger.error('Container ref not available');
			error = 'Container not ready';
			return;
		}

		isProcessing = true;
		error = null;

		const img = new Image();

		// Determine crossOrigin
		try {
			const currentOrigin = window.location.origin;
			const imageOrigin = new URL(imageSrc, currentOrigin).origin;

			if (imageOrigin !== currentOrigin) {
				img.crossOrigin = 'anonymous';
			}
		} catch (e) {
			img.crossOrigin = 'anonymous';
		}

		img.onerror = (e) => {
			error = 'Failed to load image';
			isProcessing = false;
			console.error('[Editor] Image load FAILED for URL:', cleanedSrc, e);
			logger.error('Image load failed for URL:', cleanedSrc);
		};

		img.onload = () => {
			console.log('[Editor] Image loaded successfully:', { width: img.width, height: img.height });
			try {
				const containerWidth = containerRef!.clientWidth;
				const containerHeight = containerRef!.clientHeight;

				if (containerWidth === 0 || containerHeight === 0) {
					logger.warn('Container dimensions are 0. Stage might not be visible.');
				}

				// Clear existing stage
				const existingStage = imageEditorStore.state.stage;
				if (existingStage) {
					existingStage.destroy();
				}

				// Create stage
				const stage = new Konva.Stage({
					container: containerRef!,
					width: containerWidth || 800,
					height: containerHeight || 600
				});

				const layer = new Konva.Layer();
				stage.add(layer);

				// Calculate scale
				const scaleX = (containerWidth * 0.8) / img.width;
				const scaleY = (containerHeight * 0.8) / img.height;
				const scale = Math.min(scaleX, scaleY);

				// Create image node
				const imageNode = new Konva.Image({
					image: img,
					width: img.width,
					height: img.height,
					x: -img.width / 2,
					y: -img.height / 2
				});

				// Create group for transforms
				const imageGroup = new Konva.Group({
					x: containerWidth / 2,
					y: containerHeight / 2,
					scaleX: scale,
					scaleY: scale
				});

				imageGroup.add(imageNode);
				layer.add(imageGroup);
				layer.draw();

				// Update store
				imageEditorStore.setStage(stage);
				imageEditorStore.setLayer(layer);
				imageEditorStore.setImageNode(imageNode);
				imageEditorStore.setImageGroup(imageGroup);

				if (file) {
					imageEditorStore.setFile(file);
				}

				// Initial snapshot
				imageEditorStore.takeSnapshot();

				isProcessing = false;
			} catch (err) {
				error = 'Failed to setup editor';
				isProcessing = false;
				logger.error('Konva setup error:', err);
			}
		};

		img.src = cleanedSrc;
	}

	// Handle resize
	function handleResize() {
		const { stage, imageGroup } = imageEditorStore.state;
		if (!stage || !containerRef) return;

		const containerWidth = containerRef.clientWidth;
		const containerHeight = containerRef.clientHeight;

		stage.width(containerWidth);
		stage.height(containerHeight);

		// Recenter image
		if (imageGroup) {
			imageGroup.position({
				x: containerWidth / 2,
				y: containerHeight / 2
			});
		}

		stage.batchDraw();
	}

	// Handle keyboard shortcuts
	function handleKeyDown(event: KeyboardEvent) {
		// Skip if typing in input
		const target = event.target as HTMLElement;
		const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true';
		if (isInput) return;

		const cmdOrCtrl = event.metaKey || event.ctrlKey;
		const shift = event.shiftKey;

		// Escape: Exit tool
		if (event.key === 'Escape') {
			const currentState = imageEditorStore.state.activeState;
			if (currentState) {
				imageEditorStore.saveToolState();
				imageEditorStore.cleanupToolSpecific(currentState);
				imageEditorStore.setActiveState('');
			}
			return;
		}

		// Ctrl/Cmd+Z: Undo
		if (cmdOrCtrl && !shift && event.key === 'z') {
			event.preventDefault();
			handleUndo();
			return;
		}

		// Ctrl/Cmd+Shift+Z: Redo
		if (cmdOrCtrl && shift && event.key === 'z') {
			event.preventDefault();
			handleRedo();
			return;
		}

		// Delete: Remove selected
		if (event.key === 'Delete') {
			const currentState = imageEditorStore.state.activeState;
			if (currentState === 'textoverlay' || currentState === 'shapeoverlay') {
				const deleteBtn = document.querySelector('.preset-filled-error-500.btn') as HTMLButtonElement;
				deleteBtn?.click();
			}
		}
	}

	// Undo/Redo
	export function handleUndo() {
		if (!imageEditorStore.canUndoState) return;

		const currentState = imageEditorStore.state.activeState;
		if (currentState) {
			imageEditorStore.cleanupToolSpecific(currentState);
			imageEditorStore.setActiveState('');
		}

		const stateData = imageEditorStore.undoState();
		if (stateData) {
			restoreFromStateData(stateData);
		}
	}

	export function handleRedo() {
		if (!imageEditorStore.canRedoState) return;

		const currentState = imageEditorStore.state.activeState;
		if (currentState) {
			imageEditorStore.cleanupToolSpecific(currentState);
			imageEditorStore.setActiveState('');
		}

		const stateData = imageEditorStore.redoState();
		if (stateData) {
			restoreFromStateData(stateData);
		}
	}

	// Restore state
	function restoreFromStateData(stateData: string) {
		const { stage, layer, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !layer || !imageNode || !imageGroup) return;

		try {
			// Deep cleanup before restoration
			imageEditorStore.cleanupTempNodes();

			const rawData = JSON.parse(stateData);
			// Support both legacy (pure stage JSON) and new format (snapshot object)
			const isNewFormat = rawData.stage && rawData.activeState !== undefined;
			const stateJSON = isNewFormat ? JSON.parse(rawData.stage) : rawData;

			if (isNewFormat) {
				imageEditorStore.setActiveState(rawData.activeState);
			}

			// Clear filters to ensure a clean slate
			imageNode.filters([]);
			imageNode.clearCache();

			// The JSON structure is typically Stage -> Layer -> [Children]
			// We look for our expected hierarchy: imageGroup -> imageNode
			const findImageGroupState = (nodes: any[]): any => {
				for (const node of nodes) {
					if (node.className === 'Group' && node.children?.some((c: any) => c.className === 'Image')) {
						return node;
					}
					if (node.children) {
						const found = findImageGroupState(node.children);
						if (found) return found;
					}
				}
				return null;
			};

			const imageGroupState = findImageGroupState(stateJSON.children || []);

			if (imageGroupState && imageGroupState.attrs) {
				// Restore image group transforms
				imageGroup.setAttrs({
					x: imageGroupState.attrs.x ?? stage.width() / 2,
					y: imageGroupState.attrs.y ?? stage.height() / 2,
					scaleX: imageGroupState.attrs.scaleX ?? 1,
					scaleY: imageGroupState.attrs.scaleY ?? 1,
					rotation: imageGroupState.attrs.rotation ?? 0
				});

				const imageNodeState = imageGroupState.children.find((c: any) => c.className === 'Image');
				if (imageNodeState && imageNodeState.attrs) {
					// Restore image node properties
					imageNode.setAttrs({
						cropX: imageNodeState.attrs.cropX,
						cropY: imageNodeState.attrs.cropY,
						cropWidth: imageNodeState.attrs.cropWidth,
						cropHeight: imageNodeState.attrs.cropHeight,
						width: imageNodeState.attrs.width,
						height: imageNodeState.attrs.height,
						x: imageNodeState.attrs.x,
						y: imageNodeState.attrs.y,
						cornerRadius: imageNodeState.attrs.cornerRadius ?? 0
					} as any);

					// Restore Filters
					if (imageNodeState.attrs.filters?.length > 0) {
						// Convert filter names to actual Konva filter functions if needed
						// but usually Konva restores them if registered.
						// To be safe, we re-apply based on attrs
						const activeFilters = [];
						if (imageNodeState.attrs.brightness !== undefined) activeFilters.push(Konva.Filters.Brighten);
						if (imageNodeState.attrs.contrast !== undefined) activeFilters.push(Konva.Filters.Contrast);
						if (imageNodeState.attrs.saturation !== undefined || imageNodeState.attrs.luminance !== undefined) activeFilters.push(Konva.Filters.HSL);

						imageNode.filters(activeFilters);
						imageNode.setAttrs(imageNodeState.attrs);
						imageNode.cache();
					}
				}
			}

			layer.batchDraw();
			stage.batchDraw();
		} catch (err) {
			logger.error('Failed to restore state:', err);
			error = 'Failed to restore state';
		}
	}

	// Save
	export async function handleSave() {
		const { stage, file } = imageEditorStore.state;
		if (!stage || !file) {
			error = 'Nothing to save';
			return;
		}

		isProcessing = true;
		error = null;

		try {
			// CRITICAL: Hide all UI elements before taking the snapshot
			// to avoid baking handles/toolbars into the image.
			imageEditorStore.hideAllUI();

			let dataURL: string;
			let mimeType: string;
			let fileExtension: string;

			// Try AVIF first, fallback to WebP
			try {
				dataURL = stage.toDataURL({
					mimeType: 'image/avif',
					quality: 0.85,
					pixelRatio: 1
				});

				if (dataURL.startsWith('data:image/avif')) {
					mimeType = 'image/avif';
					fileExtension = 'avif';
					logger.debug('Using AVIF format');
				} else {
					throw new Error('AVIF not supported');
				}
			} catch {
				logger.warn('AVIF not supported, using WebP');
				dataURL = stage.toDataURL({
					mimeType: 'image/webp',
					quality: 0.95,
					pixelRatio: 1
				});
				mimeType = 'image/webp';
				fileExtension = 'webp';
			}

			const response = await fetch(dataURL);
			const blob = await response.blob();

			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const newFileName = `edited-${timestamp}.${fileExtension}`;
			const editedFile = new File([blob], newFileName, { type: mimeType });

			const { file: originalFile } = imageEditorStore.state;
			const storeMediaId = (originalFile as any)?._id;

			onsave({ 
				dataURL, 
				file: editedFile,
				focalPoint,
				mediaId: storeMediaId || mediaId
			});
		} catch (err) {
			logger.error('Save error:', err);
			error = 'Failed to save image';
		} finally {
			isProcessing = false;
		}
	}

	// Cancel
	export function handleCancel() {
		oncancel();
	}

	// Cancel tool (Discard changes)
	export function handleCancelTool() {
		const currentState = imageEditorStore.state.activeState;
		if (!currentState) return;

		if (preToolSnapshot) {
			restoreFromStateData(preToolSnapshot);
			// Also clear history forward if needed? No, undoState(true) just returns top.
		}

		imageEditorStore.cleanupToolSpecific(currentState);
		imageEditorStore.setActiveState('');
		imageEditorStore.setToolbarControls(null);
		preToolSnapshot = null;
	}

	// Lifecycle
	onMount(() => {
		imageEditorStore.reset();
		window.addEventListener('resize', handleResize);
		window.addEventListener('keydown', handleKeyDown);

		// Wait for container to be ready with a polling mechanism
		// This handles modal animation delays
		let retryCount = 0;
		const maxRetries = 20; // Max 2 seconds of waiting
		
		const checkContainerReady = () => {
			if (containerRef && containerRef.clientWidth > 0 && containerRef.clientHeight > 0) {
				containerWidth = containerRef.clientWidth;
				containerHeight = containerRef.clientHeight;
				console.log('[Editor] Container ready:', { containerWidth, containerHeight });
			} else if (retryCount < maxRetries) {
				retryCount++;
				console.log(`[Editor] Container not ready, retry ${retryCount}/${maxRetries}...`);
				setTimeout(checkContainerReady, 100);
			} else {
				console.error('[Editor] Container did not become ready after', maxRetries, 'retries');
			}
		};
		
		// Start checking after a small delay for modal animation
		setTimeout(checkContainerReady, 50);

		return () => {
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('keydown', handleKeyDown);
			imageEditorStore.cleanupTempNodes();
			imageEditorStore.reset();
		};
	});

	onDestroy(() => {
		if (selectedImage && selectedImage.startsWith('blob:')) {
			URL.revokeObjectURL(selectedImage);
		}
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

	<div class="editor-main flex min-w-0 flex-1 flex-col">
		<div class="canvas-wrapper relative flex flex-1 flex-col">
			<EditorCanvas bind:containerRef bind:containerWidth bind:containerHeight {hasImage} isLoading={isProcessing}>
				{#if storeState.stage && storeState.layer && storeState.imageNode && storeState.imageGroup}
					{#if activeToolComponent}
						{@const Component = activeToolComponent}
						<Component onCancel={handleCancelTool} />
					{/if}
				{/if}
			</EditorCanvas>
		</div>
	</div>
</div>

<style>
	:global(.crop-bottom-bar) {
		position: absolute;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
	}
</style>
