<!--
@file: src/routes/(app)/imageEditor/ImageEditor.svelte
@component
**Main reusable Image Editor component with Pintura-inspired UX**
A comprehensive image editing interface with left sidebar tools, responsive design,
and unified tool experiences (crop includes rotation, scale, flip).

#### Props
- `imageFile` (optional): File object of the image to edit
- `initialImageSrc` (optional): URL/path to initial image
- `config` (optional): Editor configuration options
- `onSave` (optional): Callback when image is saved
- `onCancel` (optional): Callback when editor is cancelled
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { logger } from '@utils/logger';

	// Store
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';

	// Import migrated tool components (moved under widgets/*)
	import Crop from './widgets/Crop/Tool.svelte';
	import Blur from './widgets/Blur/Tool.svelte';
	import FineTune from './widgets/FineTune/Tool.svelte';
	import Watermark from './widgets/Watermark/Tool.svelte';
	import Annotate from './widgets/Annotate/Tool.svelte';

	// Layout components
	import EditorSidebar from './components/toolbars/EditorSidebar.svelte';
	import EditorCanvas from './components/toolbars/EditorCanvas.svelte';
	import FocalPoint from './components/FocalPoint.svelte';

	import { updateMediaMetadata } from '@utils/media/api';

	// Konva
	import Konva from 'konva';

	// Props
	const {
		imageFile = null,
		initialImageSrc = '',
		mediaId = null,
		onSave = null,
		onCancel = null
	}: {
		imageFile?: File | null;
		initialImageSrc?: string;
		mediaId?: string | null;
		onSave?: ((dataURL: string, file: File) => void) | null;
		onCancel?: (() => void) | null;
	} = $props();

	// Local state
	let selectedImage: string = '';
	let containerRef: HTMLDivElement | undefined = $state();
	let isMobile = $state(false);
	let isTablet = $state(false);

	// Tool state is now managed within each tool component

	// Get store state reactively - since imageEditorStore.state uses
	const storeState = imageEditorStore.state;

	// Derive specific values for better reactivity tracking
	const activeState = $derived(imageEditorStore.state.activeState);

	// Responsive breakpoint detection
	function checkResponsive() {
		if (typeof window !== 'undefined') {
			isMobile = window.innerWidth < 768;
			isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
		}
	}

	// Effect to track selectedImage and clean up object URLs
	$effect(() => {
		return () => {
			if (selectedImage && selectedImage.startsWith('blob:')) {
				URL.revokeObjectURL(selectedImage);
			}
		};
	});

	// Effect to load initial image when container is ready
	let initialImageLoaded = $state(false);

	$effect(() => {
		if (containerRef && !initialImageLoaded && (initialImageSrc || imageFile)) {
			// Load initial image if provided
			if (initialImageSrc) {
				selectedImage = initialImageSrc;
				loadImageAndSetupKonva(selectedImage);
				initialImageLoaded = true;
			} else if (imageFile) {
				selectedImage = URL.createObjectURL(imageFile);
				loadImageAndSetupKonva(selectedImage, imageFile);
				initialImageLoaded = true;
			}
		}
	});

	onMount(() => {
		// Initialize responsive detection
		checkResponsive();

		// Reset the image editor store for clean state
		imageEditorStore.reset();

		// Add window resize event listener
		window.addEventListener('resize', handleResize);

		// Add event listener for image upload from header
		function handleHeaderUpload(event: Event) {
			const customEvent = event as CustomEvent<{ file: File }>;
			if (customEvent.detail?.file) {
				const imageFile = customEvent.detail.file;

				// Clean up previous image URL if it exists
				if (selectedImage && selectedImage.startsWith('blob:')) {
					URL.revokeObjectURL(selectedImage);
				}

				// Set file in store FIRST to trigger hasImage = true
				imageEditorStore.setFile(imageFile);

				// Create new object URL and update state
				selectedImage = URL.createObjectURL(imageFile);
				loadImageAndSetupKonva(selectedImage, imageFile);
			}
		}
		window.addEventListener('imageEditorUpload', handleHeaderUpload as EventListener);

		// Add event listener for fine-tune adjustments
		function handleFineTuneAdjustment() {
			// Take a snapshot when fine-tune adjustments are made
			takeSnapshot();
		}
		window.addEventListener('fineTuneAdjustment', handleFineTuneAdjustment as unknown as (event: Event) => void);

		// Add keyboard event listener for shortcuts
		function handleKeyDown(event: KeyboardEvent) {
			// Check if user is typing in an input field
			const target = event.target as HTMLElement;
			const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true';

			if (isInputField) return; // Don't trigger shortcuts when typing

			const cmdOrCtrl = event.metaKey || event.ctrlKey;
			const shift = event.shiftKey;

			// Escape: Exit current tool
			if (event.key === 'Escape') {
				const currentState = imageEditorStore.state.activeState;
				if (currentState) {
					// Save state before exiting
					imageEditorStore.saveToolState();
					// Use tool-specific cleanup
					imageEditorStore.cleanupToolSpecific(currentState);
					imageEditorStore.setActiveState('');
				}
				return;
			}

			// Cmd/Ctrl+Z: Undo
			if (cmdOrCtrl && !shift && event.key === 'z') {
				event.preventDefault();
				handleUndo();
				return;
			}

			// Shift+Cmd/Ctrl+Z: Redo
			if (cmdOrCtrl && shift && event.key === 'z') {
				event.preventDefault();
				handleRedo();
				return;
			}

			// Delete: Remove selected text or shape
			if (event.key === 'Delete') {
				const currentState = imageEditorStore.state.activeState;
				if (currentState === 'textoverlay') {
					// Trigger delete for selected text
					const deleteBtn = document.querySelector('.variant-filled-error.btn') as HTMLButtonElement;
					if (deleteBtn && !deleteBtn.disabled) {
						deleteBtn.click();
					}
				} else if (currentState === 'shapeoverlay') {
					// Trigger delete for selected shape
					const deleteBtn = document.querySelector('.variant-filled-error.btn') as HTMLButtonElement;
					if (deleteBtn && !deleteBtn.disabled) {
						deleteBtn.click();
					}
				}
				return;
			}
		}

		window.addEventListener('keydown', handleKeyDown);

		// Cleanup event listeners and reset store on component destroy
		return () => {
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('imageEditorUpload', handleHeaderUpload as EventListener);
			window.removeEventListener('fineTuneAdjustment', handleFineTuneAdjustment as unknown as (event: Event) => void);
			window.removeEventListener('keydown', handleKeyDown);

			// Force cleanup of all temporary nodes first
			imageEditorStore.cleanupTempNodes();
			// Then reset the store
			imageEditorStore.reset();
		};
	});

	function handleResize() {
		checkResponsive();

		const { stage } = imageEditorStore.state;
		if (stage && containerRef) {
			const containerWidth = containerRef.clientWidth;
			const containerHeight = containerRef.clientHeight;

			stage.width(containerWidth);
			stage.height(containerHeight);

			// Center the image in the new dimensions
			centerImageInStage();
		}
	}

	function loadImageAndSetupKonva(imageSrc: string, file?: File) {
		if (!containerRef) {
			logger.error('Container ref not available - this should not happen');
			return;
		}

		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			const containerWidth = containerRef!.clientWidth;
			const containerHeight = containerRef!.clientHeight;

			// Clear any existing stage
			const existingStage = imageEditorStore.state.stage;
			if (existingStage) {
				existingStage.destroy();
			}

			// Create new stage
			const stage = new Konva.Stage({
				container: containerRef!,
				width: containerWidth,
				height: containerHeight
			});

			const layer = new Konva.Layer();
			stage.add(layer);

			// Calculate scale to fit image in container while maintaining aspect ratio
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

			// Create group container for transforms
			const imageGroup = new Konva.Group({
				x: containerWidth / 2,
				y: containerHeight / 2,
				scaleX: scale,
				scaleY: scale
			});

			imageGroup.add(imageNode);
			layer.add(imageGroup);
			layer.draw();

			// Store in imageEditorStore
			imageEditorStore.setStage(stage);
			imageEditorStore.setLayer(layer);
			imageEditorStore.setImageNode(imageNode);
			imageEditorStore.setImageGroup(imageGroup);

			if (file) {
				imageEditorStore.setFile(file);
			}

			// Take initial snapshot for undo/redo
			takeSnapshot();
		};
		img.src = imageSrc;
	}

	function centerImageInStage() {
		const { stage, imageGroup } = imageEditorStore.state;
		if (!stage || !imageGroup) return;

		imageGroup.position({
			x: stage.width() / 2,
			y: stage.height() / 2
		});

		stage.batchDraw();
	}

	function takeSnapshot() {
		const { stage, layer, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !layer || !imageNode || !imageGroup) return;

		// Force a redraw to ensure the current state is captured
		layer.batchDraw();

		// Use the store's JSON-based snapshot system
		imageEditorStore.takeSnapshot();
	}

	function applyEdit() {
		takeSnapshot();
	}

	function handleUndo() {
		if (!imageEditorStore.canUndoState) return;

		// Clean up any active tool before undoing
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

	function handleRedo() {
		if (!imageEditorStore.canRedoState) return;

		// Clean up any active tool before redoing
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

	function restoreFromStateData(stateData: string) {
		const { stage, layer, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !layer || !imageNode || !imageGroup) return;

		try {
			// Clean up any temporary nodes before restoring
			imageEditorStore.cleanupTempNodes();

			// Parse the state data to extract properties
			const stateJSON = JSON.parse(stateData);

			// Clear filters temporarily to ensure clean state
			imageNode.filters([]);
			imageNode.clearCache(); // Restore image group properties (position, scale, rotation)
			// The structure is: stage > layer > imageGroup > imageNode
			// So imageGroup is at stateJSON.children[0].children[0]
			if (stateJSON.children && stateJSON.children[0] && stateJSON.children[0].children && stateJSON.children[0].children[0]) {
				const imageGroupState = stateJSON.children[0].children[0];
				if (imageGroupState.attrs) {
					imageGroup.x(imageGroupState.attrs.x !== undefined ? imageGroupState.attrs.x : stage.width() / 2);
					imageGroup.y(imageGroupState.attrs.y !== undefined ? imageGroupState.attrs.y : stage.height() / 2);
					imageGroup.scaleX(imageGroupState.attrs.scaleX !== undefined ? imageGroupState.attrs.scaleX : 1);
					imageGroup.scaleY(imageGroupState.attrs.scaleY !== undefined ? imageGroupState.attrs.scaleY : 1);
					imageGroup.rotation(imageGroupState.attrs.rotation !== undefined ? imageGroupState.attrs.rotation : 0);
				}
			}

			// Restore image node properties (crop, dimensions, position)
			if (stateJSON.children && stateJSON.children[0] && stateJSON.children[0].children && stateJSON.children[0].children[0]) {
				const imageGroupState = stateJSON.children[0].children[0];
				const imageNodeState = imageGroupState.children && imageGroupState.children[0];
				if (imageNodeState.attrs) {
					// Apply crop properties
					if (imageNodeState.attrs.cropX !== undefined) imageNode.cropX(imageNodeState.attrs.cropX);
					if (imageNodeState.attrs.cropY !== undefined) imageNode.cropY(imageNodeState.attrs.cropY);
					if (imageNodeState.attrs.cropWidth !== undefined) imageNode.cropWidth(imageNodeState.attrs.cropWidth);
					if (imageNodeState.attrs.cropHeight !== undefined) imageNode.cropHeight(imageNodeState.attrs.cropHeight);

					// Apply other image properties
					if (imageNodeState.attrs.width !== undefined) imageNode.width(imageNodeState.attrs.width);
					if (imageNodeState.attrs.height !== undefined) imageNode.height(imageNodeState.attrs.height);
					if (imageNodeState.attrs.x !== undefined) imageNode.x(imageNodeState.attrs.x);
					if (imageNodeState.attrs.y !== undefined) imageNode.y(imageNodeState.attrs.y);

					// Apply filters if they exist
					if (imageNodeState.attrs.filters && Array.isArray(imageNodeState.attrs.filters) && imageNodeState.attrs.filters.length > 0) {
						// Reapply filters to the image node
						imageNode.filters(imageNodeState.attrs.filters);

						// Apply filter properties
						if (imageNodeState.attrs.brightness !== undefined) imageNode.brightness(imageNodeState.attrs.brightness);
						if (imageNodeState.attrs.contrast !== undefined) imageNode.contrast(imageNodeState.attrs.contrast);
						if (imageNodeState.attrs.saturation !== undefined) imageNode.saturation(imageNodeState.attrs.saturation);
						if (imageNodeState.attrs.hue !== undefined) imageNode.hue(imageNodeState.attrs.hue);
						if (imageNodeState.attrs.luminance !== undefined) imageNode.luminance(imageNodeState.attrs.luminance);
					}
				}
			}

			// Cache the image node if it has filters
			const filters = imageNode.filters();
			if (filters && Array.isArray(filters) && filters.length > 0) {
				imageNode.cache();
			}

			// Redraw the stage
			layer.batchDraw();
			stage.batchDraw();
		} catch (error) {
			logger.error('Failed to restore from state data:', error);
		}
	}

	async function handleSave() {
		const { stage, file } = imageEditorStore.state;
		if (!stage || !file) {
			logger.error('No stage or file available for saving');
			return;
		}

		try {
			// Convert canvas to blob using AVIF format (50% smaller than WebP)
			// Try AVIF first, fallback to WebP if not supported
			let dataURL: string;
			let mimeType: string;
			let fileExtension: string;

			try {
				// Test AVIF support by attempting conversion
				dataURL = stage.toDataURL({
					mimeType: 'image/avif',
					quality: 0.85,
					pixelRatio: 1
				});
				// Verify AVIF was actually created
				if (dataURL.startsWith('data:image/avif')) {
					mimeType = 'image/avif';
					fileExtension = 'avif';
					logger.debug('Using AVIF format for export');
				} else {
					throw new Error('AVIF not supported by browser');
				}
			} catch (e) {
				// Fallback to WebP if AVIF is not supported
				logger.warn('AVIF not supported, falling back to WebP', e);
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

			// Create a new file with the edited image (dynamic format)
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const newFileName = `edited-${timestamp}.${fileExtension}`;
			const editedFile = new File([blob], newFileName, { type: mimeType });
			// Create form data for the API request
			const formData = new FormData();
			formData.append('processType', 'save');
			formData.append('files', editedFile);

			// Add focal point metadata if it exists

			// Send to media API
			const saveResponse = await fetch('/api/media/process', {
				method: 'POST',
				body: formData
			});

			if (!saveResponse.ok) {
				const errorData = await saveResponse.json();
				throw new Error(errorData.error || 'Failed to save image');
			}

			const result = await saveResponse.json();

			if (!result.success) {
				throw new Error(result.error || 'Failed to save image');
			}

			// Call custom save handler if provided with the new file info
			if (onSave) {
				onSave(dataURL, editedFile);
				return;
			}

			// Update the store with the new file
			imageEditorStore.setFile(editedFile);

			// Show success notification
			const notification = document.querySelector('.success-message');
			if (notification) {
				notification.classList.add('show');
				setTimeout(() => {
					notification.classList.remove('show');
				}, 3000);
			}
		} catch (error) {
			logger.error('Error saving image:', error);

			// Show error notification
			const errorNotification = document.querySelector('.error-message') || createErrorNotification();
			if (errorNotification) {
				errorNotification.textContent = `Error: ${error instanceof Error ? error.message : 'Failed to save image'}`;
				errorNotification.classList.add('show');
				setTimeout(() => {
					errorNotification.classList.remove('show');
				}, 5000);
			}
		}
	}

	function createErrorNotification() {
		const notification = document.createElement('div');
		notification.className = 'error-message';
		notification.style.cssText = `
			position: fixed;
			bottom: 20px;
			right: 20px;
			background-color: #f44336;
			color: white;
			padding: 15px;
			border-radius: 5px;
			box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
			opacity: 0;
			transition: opacity 0.3s ease;
			z-index: 1000;
		`;
		document.body.appendChild(notification);
		return notification;
	}

	function handleCancel() {
		if (onCancel) {
			onCancel();
		}
	}

	// Expose actions to layout header/footer
	onMount(() => {
		imageEditorStore.setActions({
			undo: handleUndo,
			redo: handleRedo,
			save: handleSave,
			cancel: handleCancel
		});
		return () => imageEditorStore.setActions({ undo: undefined, redo: undefined, save: undefined, cancel: undefined });
	});

	function toggleTool(tool: string) {
		const currentState = imageEditorStore.state.activeState;

		// Save the current tool state before switching
		if (currentState && currentState !== tool) {
			imageEditorStore.saveToolState();
			// Use tool-specific cleanup for better artifact removal
			imageEditorStore.cleanupToolSpecific(currentState);

			// Ensure imageGroup is centered after tool cleanup
			const { stage, imageGroup } = imageEditorStore.state;
			if (stage && imageGroup) {
				const stageWidth = stage.width();
				const stageHeight = stage.height();
				const expectedX = stageWidth / 2;
				const expectedY = stageHeight / 2;
				const currentX = imageGroup.x();
				const currentY = imageGroup.y();

				// Recenter if position has drifted
				if (Math.abs(currentX - expectedX) > 5 || Math.abs(currentY - expectedY) > 5) {
					imageGroup.position({
						x: expectedX,
						y: expectedY
					});
				}
			}
		}

		const newState = currentState === tool ? '' : tool;
		imageEditorStore.setActiveState(newState);

		// Clear toolbar controls when turning off a tool
		if (newState === '') {
			imageEditorStore.setToolbarControls(null);
		}
	}

	async function handleApplyFocalPoint(detail: { x: number; y: number }) {
		try {
			if (!mediaId) {
				logger.warn('No mediaId provided; focal point will not be persisted.');
				return;
			}
			await updateMediaMetadata(mediaId, { focalPoint: { x: detail.x, y: detail.y } });
			logger.debug('Focal point saved', detail);
		} catch (e) {
			logger.error('Failed to save focal point', e);
		}
	}
</script>

<div class="image-editor" class:mobile={isMobile} class:tablet={isTablet} role="application" aria-label="Image editor">
	<!-- Desktop/Tablet Layout -->
	{#if !isMobile}
		<div class="editor-layout">
			<!-- Left Sidebar -->
			<EditorSidebar activeState={activeState ?? ''} onToolSelect={toggleTool} hasImage={!!storeState.imageNode} />

			<!-- Main Canvas Area -->
			<div class="editor-main">
				<!-- Canvas Container - Full area, controls are in layout header -->
				<div class="canvas-wrapper">
					<EditorCanvas bind:containerRef hasImage={!!storeState.imageNode}>
						<!-- Render tool components here so they can be controlled -->
						{#if storeState.stage && storeState.layer && storeState.imageNode && storeState.imageGroup}
							{#if activeState === 'focalpoint'}
								<FocalPoint stage={storeState.stage} imageNode={storeState.imageNode} on:apply={(e) => handleApplyFocalPoint(e.detail)} />
							{/if}
							<Crop
								onCropApplied={() => {
									applyEdit();
								}}
							/>
							<FineTune />
							<Blur />
							<Watermark />
							<Annotate
								onAnnotateApplied={() => {
									applyEdit();
								}}
							/>
						{/if}
					</EditorCanvas>
					<!-- Footer toolbar is rendered via layout when on image editor route -->
				</div>
			</div>
		</div>
	{:else}
		<!-- Mobile Layout -->
		<div class="editor-mobile">
			<!-- Top Controls (Mobile) -->
			<div class="mobile-controls">
				<div class="controls-left">
					{#if onCancel}
						<button onclick={handleCancel} class="variant-ghost btn-icon" aria-label="Cancel editing">
							<iconify-icon icon="mdi:close" width="20"></iconify-icon>
						</button>
					{/if}
				</div>
				<div class="controls-center" role="status" aria-live="polite">
					{#if storeState.file}
						<span class="filename text-sm font-medium">
							{storeState.file.name}
						</span>
					{/if}
				</div>
				<div class="controls-right">
					{#if storeState.file}
						<button onclick={handleSave} class="variant-filled-primary btn btn-sm"> Save </button>
					{/if}
				</div>
			</div>

			<!-- Canvas (Mobile) -->
			<div class="canvas-wrapper-mobile">
				<EditorCanvas bind:containerRef hasImage={!!storeState.imageNode}>
					<!-- Render tool components here so they can be controlled -->
					{#if storeState.stage && storeState.layer && storeState.imageNode && storeState.imageGroup}
						<Crop
							onCropApplied={() => {
								applyEdit();
							}}
						/>
						<FineTune />
						<Blur />
						<Watermark />
						<Annotate
							onAnnotateApplied={() => {
								applyEdit();
							}}
						/>
					{/if}

					<!-- Tool-specific top toolbars are rendered within each tool component -->
				</EditorCanvas>
			</div>

			<!-- Unified Bottom Toolbar (Mobile) -->
			<!-- Footer toolbar is rendered via layout when on image editor route -->
		</div>
	{/if}
</div>

<style lang="postcss">
	@import "tailwindcss";
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

	.editor-mobile {
		@apply flex h-full flex-col overflow-hidden;
	}

	.mobile-controls {
		@apply flex items-center justify-between gap-2 border-b p-3;
		border-color: var(--color-surface-300);
	}

	.controls-left,
	.controls-right {
		@apply flex items-center gap-2;
	}

	.controls-center {
		@apply flex flex-1 items-center justify-center;
	}

	.canvas-wrapper-mobile {
		@apply relative;
		flex-grow: 1;
	}

	/* Tool-specific overrides */
	:global(.crop-bottom-bar) {
		position: absolute;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
	}

	/* Responsive adjustments */
	.tablet .editor-layout,
	.mobile .editor-layout {
		@apply grid grid-cols-[auto_1fr];
	}

	.mobile .editor-main {
		@apply flex;
	}
</style>
