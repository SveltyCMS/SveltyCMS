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
	import { updateMediaMetadata } from '@utils/media/api';

	import EditorSidebar from './EditorSidebar.svelte';
	import EditorCanvas from './EditorCanvas.svelte';
	import FocalPoint from './FocalPoint.svelte';

	import Konva from 'konva';
	import { editorWidgets } from './widgets/registry';

	interface Props {
		imageFile?: File | null;
		initialImageSrc?: string;
		mediaId?: string | null;
		focalPoint?: { x: number; y: number };
		onsave?: (detail: { dataURL: string; file: File }) => void;
		oncancel?: () => void;
	}

	const {
		imageFile = null,
		initialImageSrc = '',
		mediaId = null,
		focalPoint = { x: 50, y: 50 },
		onsave = () => {},
		oncancel = () => {}
	}: Props = $props();

	// State
	let selectedImage = $state('');
	let containerRef = $state<HTMLDivElement | undefined>(undefined);
	let initialImageLoaded = $state(false);
	let isProcessing = $state(false);
	let error = $state<string | null>(null);

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

	// Load initial image effect
	$effect(() => {
		if (containerRef && !initialImageLoaded && (initialImageSrc || imageFile)) {
			if (initialImageSrc) {
				logger.debug('Loading initial image from src:', initialImageSrc);
				selectedImage = initialImageSrc;
				loadImageAndSetupKonva(selectedImage);
			} else if (imageFile) {
				logger.debug('Loading initial image from file');
				selectedImage = URL.createObjectURL(imageFile);
				loadImageAndSetupKonva(selectedImage, imageFile);
			}
			initialImageLoaded = true;
		}
	});

	// Load image and setup Konva
	function loadImageAndSetupKonva(imageSrc: string, file?: File) {
		if (!containerRef) {
			logger.error('Container ref not available');
			error = 'Container not ready';
			return;
		}

		isProcessing = true;
		error = null;

		const img = new Image();
		img.crossOrigin = 'anonymous';

		img.onerror = () => {
			error = 'Failed to load image';
			isProcessing = false;
			logger.error('Image load error');
		};

		img.onload = () => {
			try {
				const containerWidth = containerRef!.clientWidth;
				const containerHeight = containerRef!.clientHeight;

				// Clear existing stage
				const existingStage = imageEditorStore.state.stage;
				if (existingStage) {
					existingStage.destroy();
				}

				// Create stage
				const stage = new Konva.Stage({
					container: containerRef!,
					width: containerWidth,
					height: containerHeight
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

		img.src = imageSrc;
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
				const deleteBtn = document.querySelector('.variant-filled-error.btn') as HTMLButtonElement;
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
			imageEditorStore.cleanupTempNodes();
			const stateJSON = JSON.parse(stateData);

			// Clear filters
			imageNode.filters([]);
			imageNode.clearCache();

			// Restore image group
			if (stateJSON.children?.[0]?.children?.[0]) {
				const imageGroupState = stateJSON.children[0].children[0];
				if (imageGroupState.attrs) {
					imageGroup.x(imageGroupState.attrs.x ?? stage.width() / 2);
					imageGroup.y(imageGroupState.attrs.y ?? stage.height() / 2);
					imageGroup.scaleX(imageGroupState.attrs.scaleX ?? 1);
					imageGroup.scaleY(imageGroupState.attrs.scaleY ?? 1);
					imageGroup.rotation(imageGroupState.attrs.rotation ?? 0);
				}
			}

			// Restore image node
			if (stateJSON.children?.[0]?.children?.[0]?.children?.[0]) {
				const imageNodeState = stateJSON.children[0].children[0].children[0];
				if (imageNodeState.attrs) {
					// Crop
					if (imageNodeState.attrs.cropX !== undefined) imageNode.cropX(imageNodeState.attrs.cropX);
					if (imageNodeState.attrs.cropY !== undefined) imageNode.cropY(imageNodeState.attrs.cropY);
					if (imageNodeState.attrs.cropWidth !== undefined) imageNode.cropWidth(imageNodeState.attrs.cropWidth);
					if (imageNodeState.attrs.cropHeight !== undefined) imageNode.cropHeight(imageNodeState.attrs.cropHeight);

					// Dimensions
					if (imageNodeState.attrs.width !== undefined) imageNode.width(imageNodeState.attrs.width);
					if (imageNodeState.attrs.height !== undefined) imageNode.height(imageNodeState.attrs.height);
					if (imageNodeState.attrs.x !== undefined) imageNode.x(imageNodeState.attrs.x);
					if (imageNodeState.attrs.y !== undefined) imageNode.y(imageNodeState.attrs.y);

					// Filters
					if (imageNodeState.attrs.filters?.length > 0) {
						imageNode.filters(imageNodeState.attrs.filters);
						if (imageNodeState.attrs.brightness !== undefined) imageNode.brightness(imageNodeState.attrs.brightness);
						if (imageNodeState.attrs.contrast !== undefined) imageNode.contrast(imageNodeState.attrs.contrast);
						if (imageNodeState.attrs.saturation !== undefined) imageNode.saturation(imageNodeState.attrs.saturation);
						if (imageNodeState.attrs.hue !== undefined) imageNode.hue(imageNodeState.attrs.hue);
						if (imageNodeState.attrs.luminance !== undefined) imageNode.luminance(imageNodeState.attrs.luminance);
					}
				}
			}

			// Cache if filters
			if (imageNode.filters()?.length > 0) {
				imageNode.cache();
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

			onsave({ dataURL, file: editedFile });
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

	// Toggle tool
	function toggleTool(tool: string) {
		const currentState = imageEditorStore.state.activeState;

		if (currentState && currentState !== tool) {
			imageEditorStore.saveToolState();
			imageEditorStore.cleanupToolSpecific(currentState);

			// Recenter if drifted
			const { stage, imageGroup } = imageEditorStore.state;
			if (stage && imageGroup) {
				const expectedX = stage.width() / 2;
				const expectedY = stage.height() / 2;
				const currentX = imageGroup.x();
				const currentY = imageGroup.y();

				if (Math.abs(currentX - expectedX) > 5 || Math.abs(currentY - expectedY) > 5) {
					imageGroup.position({ x: expectedX, y: expectedY });
				}
			}
		}

		const newState = currentState === tool ? '' : tool;
		imageEditorStore.setActiveState(newState);

		if (newState === '') {
			imageEditorStore.setToolbarControls(null);
		}
	}

	// Focal point
	async function handleApplyFocalPoint(detail: { x: number; y: number }) {
		try {
			if (!mediaId) {
				logger.warn('No mediaId for focal point');
				return;
			}
			await updateMediaMetadata(mediaId, { focalPoint: detail });
			logger.debug('Focal point saved', detail);
		} catch (err) {
			logger.error('Failed to save focal point', err);
			error = 'Failed to save focal point';
		}
	}

	// Lifecycle
	onMount(() => {
		imageEditorStore.reset();
		window.addEventListener('resize', handleResize);
		window.addEventListener('keydown', handleKeyDown);

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

	<div class="editor-layout flex h-full overflow-hidden">
		<EditorSidebar activeState={activeState ?? ''} onToolSelect={toggleTool} {hasImage} />

		<div class="editor-main flex min-w-0 flex-1 flex-col">
			<div class="canvas-wrapper relative flex flex-1 flex-col">
				<EditorCanvas bind:containerRef {hasImage}>
					{#if storeState.stage && storeState.layer && storeState.imageNode && storeState.imageGroup}
						{#if activeState === 'focalpoint'}
							<FocalPoint
								stage={storeState.stage}
								imageNode={storeState.imageNode}
								x={focalPoint?.x}
								y={focalPoint?.y}
								onapply={handleApplyFocalPoint}
							/>
						{/if}

						{#if activeToolComponent}
							{@const Component = activeToolComponent}
							<Component />
						{/if}
					{/if}
				</EditorCanvas>
			</div>
		</div>
	</div>
</div>

<style lang="postcss">
	.image-editor {
		@apply flex h-full w-full flex-col overflow-hidden;
	}

	.editor-layout {
		@apply flex h-full overflow-hidden;
	}

	.editor-main {
		@apply flex min-w-0 flex-1 flex-col;
	}

	.canvas-wrapper {
		@apply relative flex flex-1 flex-col;
	}

	:global(.crop-bottom-bar) {
		position: absolute;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
	}
</style>
