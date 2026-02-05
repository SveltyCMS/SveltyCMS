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
		mediaId?: string;
		focalPoint?: { x: number; y: number };
		onsave?: (detail: {
			dataURL: string;
			file: File;
			focalPoint?: any;
			mediaId?: string;
			operations?: Record<string, unknown>;
			saveBehavior?: 'new' | 'overwrite';
		}) => void;
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
	/** Save as new file (default, enterprise-friendly) or overwrite original */
	let saveBehavior = $state<'new' | 'overwrite'>('new');

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

	// Reset load state when image source changes (e.g. modal opened with new image)
	let lastLoadedSrc = $state('');
	let lastLoadedFile = $state<File | null>(null);
	$effect(() => {
		const src = initialImageSrc;
		const file = imageFile;
		const srcChanged = src !== lastLoadedSrc;
		const fileChanged = file !== lastLoadedFile;
		if (srcChanged || fileChanged) {
			initialImageLoaded = false;
			selectedImage = '';
		}
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
		const src = initialImageSrc;
		const file = imageFile;

		// Reset load state when image source changes (e.g. modal opened with new image)
		const srcChanged = src !== lastLoadedSrc;
		const fileChanged = file !== lastLoadedFile;

		if (srcChanged || fileChanged) {
			initialImageLoaded = false;
			selectedImage = '';
		}

		// Skip if nothing to load
		if (!containerRef || (!src && !file)) return;

		// Wait for container to have size before initializing (modal might be animating)
		if (containerWidth === 0 || containerHeight === 0) {
			const timeoutId = setTimeout(() => {
				// Force a re-check by updating a tracked value
				if (containerRef && containerRef.clientWidth > 0 && containerRef.clientHeight > 0) {
					containerWidth = containerRef.clientWidth;
					containerHeight = containerRef.clientHeight;
				}
			}, 150);
			return () => clearTimeout(timeoutId);
		}

		// Skip if already loaded with same source
		if (initialImageLoaded && src === selectedImage && !file) return;

		// Schedule loading after a microtask to ensure DOM is ready
		queueMicrotask(() => {
			if (src) {
				selectedImage = src;
				loadImageAndSetupKonva(src);
				lastLoadedSrc = src;
				lastLoadedFile = null;
			} else if (file) {
				const blobUrl = URL.createObjectURL(file);
				selectedImage = blobUrl;
				loadImageAndSetupKonva(blobUrl, file);
				lastLoadedSrc = '';
				lastLoadedFile = file;
			}
			initialImageLoaded = true;
		});
	});

	// Handle resize
	let resizeTimeout: ReturnType<typeof setTimeout>;
	function handleResize() {
		clearTimeout(resizeTimeout);
		resizeTimeout = setTimeout(() => {
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
		}, 150);
	}

	// Load image and setup Konva
	function loadImageAndSetupKonva(imageSrc: string, file?: File, retryAttempt = 0) {
		console.log('[Editor] loadImageAndSetupKonva called:', { imageSrc, hasFile: !!file, attempt: retryAttempt });
		// CRITICAL: Validate and clean the URL to prevent double /files/ prefix
		let cleanedSrc = imageSrc;
		if (imageSrc.startsWith('/files//files/')) {
			console.warn('[Editor] Detected double /files/ prefix, fixing URL');
			cleanedSrc = imageSrc.replace('/files//files/', '/files/');
		}

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
			console.error('[Editor] Image load FAILED for URL:', cleanedSrc, e);

			// Retry logic
			if (retryAttempt < 3) {
				const delay = 1000 * (retryAttempt + 1);
				logger.warn(`Image load failed. Retrying in ${delay}ms... (Attempt ${retryAttempt + 1}/3)`);
				setTimeout(() => {
					loadImageAndSetupKonva(imageSrc, file, retryAttempt + 1);
				}, delay);
			} else {
				error = 'Failed to load image after 3 attempts';
				isProcessing = false;
				logger.error('Image load failed permanently for URL:', cleanedSrc);
			}
		};

		img.onload = () => {
			console.log('[Editor] Image loaded successfully:', { width: img.width, height: img.height });
			try {
				const containerWidth = containerRef!.clientWidth;
				const containerHeight = containerRef!.clientHeight;

				// Reuse canvas pooling
				let stage = imageEditorStore.state.stage;
				let layer = imageEditorStore.state.layer;

				if (stage && layer && stage.container() === containerRef) {
					// Prepare for reuse
					layer.destroyChildren();
					layer.clear();
					stage.width(containerWidth || 800);
					stage.height(containerHeight || 600);
				} else {
					// Create new stage
					if (stage) stage.destroy();

					stage = new Konva.Stage({
						container: containerRef!,
						width: containerWidth || 800,
						height: containerHeight || 600
					});

					layer = new Konva.Layer();
					stage.add(layer);

					imageEditorStore.setStage(stage);
					imageEditorStore.setLayer(layer);
				}

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

				// Add touch support
				imageGroup.on('touchstart', (_e: Konva.KonvaEventObject<TouchEvent>) => {
					// Placeholder for touch start logic
					// e.evt.preventDefault(); // Prevent scrolling if needed
				});
				imageGroup.on('touchmove', (_e: Konva.KonvaEventObject<TouchEvent>) => {
					// Placeholder for touch move logic
				});
				imageGroup.on('touchend', (_e: Konva.KonvaEventObject<TouchEvent>) => {
					// Placeholder for touch end logic
				});

				imageGroup.add(imageNode);
				layer!.add(imageGroup);
				layer!.draw();

				// Update store
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

	// Handle keyboard shortcuts
	function handleKeyDown(event: KeyboardEvent) {
		// Guard: avoid reading ownerDocument/tagName when target is missing (e.g. in embedded hosts)
		const target = event?.target as HTMLElement | null;
		if (!target?.ownerDocument) return;
		// Skip if typing in input
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

		// Zoom Shorcuts
		if (event.key === '+' || event.key === '=') {
			// zoomIn();
		}
		if (event.key === '-') {
			// zoomOut();
		}
		if (event.key === '0') {
			// resetZoom();
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

	/** Convert data URL to Blob without fetch (avoids CSP connect-src blocking data: URLs) */
	function dataURLToBlob(dataURL: string): Blob {
		const [header, base64] = dataURL.split(',');
		const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
		const binary = atob(base64 ?? '');
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return new Blob([bytes], { type: mime });
	}

	// Save
	export async function handleSave() {
		const { stage, file } = imageEditorStore.state;
		// Allow save when we have a stage and either a store file (new upload) or mediaId (editing existing media)
		const canSave = stage && (file || mediaId);
		if (!canSave) {
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

			// Convert data URL to Blob without fetch (CSP connect-src does not allow data:)
			const blob = dataURLToBlob(dataURL);

			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const newFileName = `edited-${timestamp}.${fileExtension}`;
			const editedFile = new File([blob], newFileName, { type: mimeType });

			const { file: originalFile } = imageEditorStore.state;
			const storeMediaId = (originalFile as any)?._id;

			onsave({
				dataURL,
				file: editedFile,
				focalPoint,
				mediaId: storeMediaId || mediaId,
				saveBehavior
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

		// Use ResizeObserver for robust container dimension detection
		let ro: ResizeObserver | null = null;

		const scheduleObserve = () => {
			if (!containerRef) return;
			const el = containerRef;
			ro = new ResizeObserver((entries) => {
				for (const e of entries) {
					const { width, height } = e.contentRect;
					if (width > 0 && height > 0) {
						containerWidth = width;
						containerHeight = height;
						ro?.disconnect();
						ro = null;
						// Also trigger resize logic if needed immediately
						if (imageEditorStore.state.stage) handleResize();
						break;
					}
				}
			});
			ro.observe(el);
		};

		// Poll until containerRef is set, then observe. Start after delay for modal open.
		let observeRetries = 0;
		const checkAndObserve = () => {
			if (containerRef) {
				scheduleObserve();
				return;
			}
			if (observeRetries < 30) {
				observeRetries++;
				setTimeout(checkAndObserve, 50);
			}
		};
		setTimeout(checkAndObserve, 120);

		// Fallback polling in case ResizeObserver fires with 0 initially
		let pollRetries = 0;
		const poll = () => {
			if (containerRef && containerRef.clientWidth > 0 && containerRef.clientHeight > 0) {
				containerWidth = containerRef.clientWidth;
				containerHeight = containerRef.clientHeight;
				return;
			}
			if (pollRetries < 25) {
				pollRetries++;
				setTimeout(poll, 100);
			}
		};
		setTimeout(poll, 200);

		return () => {
			ro?.disconnect();
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('keydown', handleKeyDown);
			imageEditorStore.cleanupTempNodes();
			imageEditorStore.reset();
		};
	});

	onDestroy(() => {
		const { stage } = imageEditorStore.state;
		if (stage) {
			stage.destroy();
		}

		if (selectedImage && selectedImage.startsWith('blob:')) {
			URL.revokeObjectURL(selectedImage);
		}

		// Clear any cached images
		if (typeof Konva !== 'undefined' && Konva.Image) {
			try {
				// Konva specific cleanup if needed
			} catch (e) {
				console.warn('Konva cleanup error', e);
			}
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

	{#if isProcessing}
		<div class="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
			<div class="text-white flex flex-col items-center gap-2">
				<iconify-icon icon="mdi:loading" class="animate-spin text-primary-500" width="48"></iconify-icon>
				<p class="font-medium">Processing image...</p>
			</div>
		</div>
	{/if}

	{#if mediaId && hasImage}
		<div class="save-behavior-bar flex flex-wrap items-center gap-3 border-b border-surface-700 bg-surface-800/60 px-3 py-2 text-sm">
			<span class="text-surface-400">Save as:</span>
			<label class="flex cursor-pointer items-center gap-2">
				<input type="radio" name="saveBehavior" value="new" bind:group={saveBehavior} class="rounded-full border-surface-600 text-primary-500" />
				<span class={saveBehavior === 'new' ? 'text-primary-400 font-medium' : 'text-surface-300'}>New file</span>
				<span class="text-surface-500 text-xs">(recommended)</span>
			</label>
			<label class="flex cursor-pointer items-center gap-2">
				<input type="radio" name="saveBehavior" value="overwrite" bind:group={saveBehavior} class="rounded-full border-surface-600 text-primary-500" />
				<span class={saveBehavior === 'overwrite' ? 'text-primary-400 font-medium' : 'text-surface-300'}>Overwrite original</span>
			</label>
			{#if saveBehavior === 'overwrite'}
				<span class="ml-2 rounded bg-warning-500/15 px-2 py-0.5 text-warning-600 dark:text-warning-400" role="status">
					Original file will be replaced and cannot be recovered.
				</span>
			{/if}
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
