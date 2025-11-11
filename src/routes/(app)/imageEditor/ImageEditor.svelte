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

	// Types
	type AdjustmentKey = 'brightness' | 'contrast' | 'saturation' | 'temperature' | 'exposure' | 'highlights' | 'shadows' | 'clarity' | 'vibrance';

	// Store
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';

	// Import individual tool components
	import Crop from './components/Crop.svelte';
	import CropTopToolbar from './components/toolbars/CropTopToolbar.svelte';
	import CropBottomBar from './components/toolbars/CropBottomBar.svelte';
	import Blur from './components/Blur.svelte';
	import BlurTopToolbar from './components/toolbars/BlurTopToolbar.svelte';
	import FineTune from './components/FineTune.svelte';
	import FineTuneTopToolbar from './components/toolbars/FineTuneTopToolbar.svelte';
	import Watermark from './components/Watermark.svelte';
	import WatermarkTopToolbar from './components/toolbars/WatermarkTopToolbar.svelte';
	import Annotate from './components/Annotate.svelte';
	import AnnotateTopToolbar from './components/toolbars/AnnotateTopToolbar.svelte';

	// Layout components
	import EditorSidebar from './components/toolbars/EditorSidebar.svelte';
	import EditorCanvas from './components/toolbars/EditorCanvas.svelte';
	import MobileToolbar from './components/toolbars/MobileToolbar.svelte';

	// Konva
	import Konva from 'konva';

	// Props
	let {
		imageFile = null,
		initialImageSrc = '',
		onSave = null,
		onCancel = null
	}: {
		imageFile?: File | null;
		initialImageSrc?: string;
		onSave?: ((dataURL: string, file: File) => void) | null;
		onCancel?: (() => void) | null;
	} = $props();

	// Local state
	let selectedImage: string = '';
	let containerRef: HTMLDivElement | undefined = $state();
	let isMobile = $state(false);
	let isTablet = $state(false);

	// Crop tool state and reference
	let cropToolRef: Crop | null = $state(null);
	let cropMode = $state<'rotation' | 'scale'>('rotation');
	let cropShape = $state<'rectangle' | 'square' | 'circular'>('rectangle');
	let cropRotationAngle = $state(0);
	let cropScaleValue = $state(100);

	// FineTune tool state
	let fineTuneRef: FineTune | null = $state(null);
	let fineTuneActiveAdjustment = $state<AdjustmentKey>('brightness');

	// Blur tool state and reference
	let blurToolRef: Blur | null = $state(null);
	let blurStrength = $state(10);

	// Annotate tool state and reference
	let annotateToolRef: Annotate | null = $state(null);
	let annotateCurrentTool: 'text' | 'rectangle' | 'circle' | 'arrow' | 'line' | null = $state(null);
	let annotateStrokeColor = $state('#ff0000');
	let annotateFillColor = $state('transparent');
	let annotateStrokeWidth = $state(2);
	let annotateFontSize = $state(20);

	// Effect to sync annotate tool with the component
	$effect(() => {
		if (activeState === 'annotate' && annotateToolRef) {
			annotateToolRef.setTool(annotateCurrentTool);
		}
	});

	// Watermark tool state and reference
	let watermarkToolRef: Watermark | null = $state(null);

	// Derived state for watermark panel - with safety check
	let watermarkPanelData = $derived.by(() => {
		try {
			if (!watermarkToolRef || typeof watermarkToolRef.getStickers !== 'function') {
				return { stickers: [], selectedSticker: null };
			}
			const stickers = watermarkToolRef.getStickers();
			const selected = watermarkToolRef.getSelectedSticker();
			return {
				stickers: stickers.map((s: { id: string; previewUrl: string }) => ({ id: s.id, previewUrl: s.previewUrl })),
				selectedSticker: selected ? { id: selected.id, previewUrl: selected.previewUrl } : null
			};
		} catch (e) {
			logger.warn('Error getting watermark data:', e);
			return { stickers: [], selectedSticker: null };
		}
	});

	// Get store state reactively - since imageEditorStore.state uses
	const storeState = imageEditorStore.state;

	// Derive specific values for better reactivity tracking
	let activeState = $derived(imageEditorStore.state.activeState);

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
					const deleteBtn = document.querySelector('.bg-error-500 text-white.btn') as HTMLButtonElement;
					if (deleteBtn && !deleteBtn.disabled) {
						deleteBtn.click();
					}
				} else if (currentState === 'shapeoverlay') {
					// Trigger delete for selected shape
					const deleteBtn = document.querySelector('.bg-error-500 text-white.btn') as HTMLButtonElement;
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

	function handleImageUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			const imageFile = target.files[0];

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

	async function handleSave() {
		const { stage, file } = imageEditorStore.state;
		if (!stage || !file) {
			logger.error('No stage or file available for saving');
			return;
		}

		try {
			// Convert canvas to blob
			const dataURL = stage.toDataURL();
			const response = await fetch(dataURL);
			const blob = await response.blob();

			// Create a new file with the edited image
			// Preserve original file extension or default to png
			const originalExtension = file.name.split('.').pop()?.toLowerCase() || 'png';
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const newFileName = `edited-${timestamp}.${originalExtension}`;
			const editedFile = new File([blob], newFileName, { type: blob.type });

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
				<!-- Top Controls -->
				<div class="editor-controls">
					<div class="controls-left">
						<div class="file-upload">
							<input id="image-upload" class="sr-only" type="file" accept="image/*" onchange={handleImageUpload} aria-label="Upload image file" />
							<label for="image-upload" class="bg-primary-500 text-white btn">
								<iconify-icon icon="mdi:upload" width="18" class="mr-2"></iconify-icon>
								Choose Image
								<span class="sr-only">Upload an image to edit</span>
							</label>
						</div>
					</div>

					<div class="controls-center" role="status" aria-live="polite">
						{#if storeState.file}
							<span class="filename text-sm text-surface-600 dark:text-surface-400">
								{storeState.file.name}
							</span>
						{/if}
					</div>

					<div class="controls-right">
						{#if storeState.file}
							<div class="flex items-center gap-1">
								<button
									onclick={handleUndo}
									disabled={!imageEditorStore.canUndoState}
									aria-label="Undo last edit"
									aria-describedby="undo-shortcut"
									class="bg-surface-100 text-surface-900 dark:bg-surface-900 dark:text-surface-100 btn-icon"
									title="Undo (Ctrl+Z)"
								>
									<iconify-icon icon="mdi:undo" width="20"></iconify-icon>
								</button>
								<span id="undo-shortcut" class="sr-only">Keyboard shortcut: Ctrl+Z or Cmd+Z</span>
								<button
									onclick={handleRedo}
									disabled={!imageEditorStore.canRedoState}
									aria-label="Redo last edit"
									aria-describedby="redo-shortcut"
									class="bg-surface-100 text-surface-900 dark:bg-surface-900 dark:text-surface-100 btn-icon"
									title="Redo (Ctrl+Shift+Z)"
								>
									<iconify-icon icon="mdi:redo" width="20"></iconify-icon>
								</button>
								<span id="redo-shortcut" class="sr-only">Keyboard shortcut: Ctrl+Shift+Z or Cmd+Shift+Z</span>
							</div>
							<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>
							<button onclick={handleSave} aria-label="Save edited image" class="bg-success-500 text-white btn" title="Save Image">
								<iconify-icon icon="material-symbols:save" width="18" class="mr-2"></iconify-icon>
								Save
							</button>
						{/if}
						{#if onCancel}
							<button onclick={handleCancel} aria-label="Cancel" class="border border-surface-500 text-surface-500 hover:bg-surface-500/10 btn"> Cancel </button>
						{/if}
					</div>
				</div>

				<!-- Canvas Container -->
				<div class="canvas-wrapper">
					<EditorCanvas bind:containerRef hasImage={!!storeState.imageNode}>
						<!-- Render tool components here so they can be controlled -->
						{#if storeState.stage && storeState.layer && storeState.imageNode && storeState.imageGroup}
							<Crop
								bind:this={cropToolRef}
								bind:rotationAngle={cropRotationAngle}
								bind:scaleValue={cropScaleValue}
								stage={storeState.stage}
								layer={storeState.layer}
								imageNode={storeState.imageNode}
								container={storeState.imageGroup}
								onApply={(cropData) => {
									const { imageNode, imageGroup, layer, stage } = imageEditorStore.state;
									if (!imageNode || !imageGroup || !layer || !stage) return;

									// Apply crop transformation
									const { x, y, width, height, isCircular } = cropData;

									// Validate crop dimensions
									if (width <= 0 || height <= 0) {
										logger.error('Invalid crop dimensions:', { width, height });
										imageEditorStore.setActiveState('');
										return;
									}

									// Set crop properties on the image node
									imageNode.setAttrs({
										cropX: x,
										cropY: y,
										cropWidth: width,
										cropHeight: height,
										width: width,
										height: height,
										x: -width / 2,
										y: -height / 2
									});

									// Apply circular clipping if needed
									if (isCircular) {
										// Create an off-screen canvas to create circular mask
										const offCanvas = document.createElement('canvas');
										const offCtx = offCanvas.getContext('2d');

										if (offCtx && imageNode.image()) {
											const img = imageNode.image() as HTMLImageElement;
											offCanvas.width = width;
											offCanvas.height = height;

											// Draw circular clip path
											const radius = Math.min(width, height) / 2;
											offCtx.beginPath();
											offCtx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
											offCtx.closePath();
											offCtx.clip();

											// Draw the cropped portion of the image
											offCtx.drawImage(
												img,
												x,
												y,
												width,
												height, // Source rectangle
												0,
												0,
												width,
												height // Destination rectangle
											);

											// Create a new image from the masked canvas
											const circularImg = new Image();
											circularImg.onload = () => {
												imageNode.image(circularImg);
												imageNode.setAttrs({
													cropX: 0,
													cropY: 0,
													cropWidth: width,
													cropHeight: height
												});
												layer.batchDraw();
											};
											circularImg.src = offCanvas.toDataURL();
										}
									}

									// Recenter and rescale the image group to fit the cropped size
									const stageWidth = stage.width();
									const stageHeight = stage.height();

									// Calculate scale based on the NEW cropped dimensions
									// This ensures we fit the cropped area to 80% of stage
									const scaleX = (stageWidth * 0.8) / width;
									const scaleY = (stageHeight * 0.8) / height;
									const scale = Math.min(scaleX, scaleY);

									// Preserve existing flip states ONLY (not scale)
									const currentScaleX = imageGroup.scaleX();
									const currentScaleY = imageGroup.scaleY();
									const flipX = currentScaleX < 0 ? -1 : 1;
									const flipY = currentScaleY < 0 ? -1 : 1;

									// Store the rotation before resetting
									const currentRotation = imageGroup.rotation();

									// Reset imageGroup transform completely
									imageGroup.x(stageWidth / 2);
									imageGroup.y(stageHeight / 2);
									imageGroup.scaleX(scale * flipX);
									imageGroup.scaleY(scale * flipY);
									imageGroup.rotation(currentRotation);

									// Ensure imageGroup is in the layer and properly configured
									imageGroup.moveToBottom(); // Ensure it's below any overlays
									imageNode.moveToBottom(); // Ensure image is at bottom of group

									// Force redraw to apply changes
									layer.batchDraw();
									stage.batchDraw();

									// THEN: Exit crop mode and do final cleanup after a short delay
									setTimeout(() => {
										// Final cleanup to catch any stragglers
										imageEditorStore.cleanupToolSpecific('crop');
										imageEditorStore.setActiveState('');
										applyEdit();
									}, 50);
								}}
							/>
							<FineTune bind:this={fineTuneRef} />
							<Blur bind:this={blurToolRef} />
							<Watermark bind:this={watermarkToolRef} stage={storeState.stage} layer={storeState.layer} imageNode={storeState.imageNode} />
							<Annotate
								bind:this={annotateToolRef}
								stage={storeState.stage}
								layer={storeState.layer}
								imageNode={storeState.imageNode}
								bind:strokeColor={annotateStrokeColor}
								bind:fillColor={annotateFillColor}
								bind:strokeWidth={annotateStrokeWidth}
								bind:fontSize={annotateFontSize}
								onAnnotationChange={() => {
									applyEdit();
								}}
							/>
						{/if}

						<!-- Crop Top Toolbar - overlaid on canvas -->
						{#if activeState === 'crop'}
							<CropTopToolbar
								onRotateLeft={() => cropToolRef?.rotateLeft()}
								onFlipHorizontal={() => cropToolRef?.flipHorizontal()}
								{cropShape}
								onCropShapeChange={(shape) => cropToolRef?.setCropShape(shape)}
								onAspectRatio={(ratio) => cropToolRef?.setAspectRatio(ratio)}
								onDone={() => cropToolRef?.apply()}
							/>
						{/if}

						<!-- Blur Top Toolbar - overlaid on canvas -->
						{#if activeState === 'blur' && blurToolRef}
							<BlurTopToolbar
								bind:blurStrength
								onBlurStrengthChange={(value) => {
									blurStrength = value;
									blurToolRef?.updateBlurStrength();
								}}
								onReset={() => blurToolRef?.reset()}
								onApply={() => {
									blurToolRef?.apply();
									applyEdit();
									imageEditorStore.setActiveState('');
								}}
							/>
						{/if}

						<!-- FineTune Top Toolbar - overlaid on canvas -->
						{#if activeState === 'finetune' && fineTuneRef}
							<FineTuneTopToolbar
								activeAdjustment={fineTuneActiveAdjustment}
								adjustmentValue={fineTuneRef?.adjustments?.[fineTuneActiveAdjustment] || 0}
								onValueChange={(value) => {
									if (fineTuneRef && fineTuneRef.handleAdjustmentChange) {
										fineTuneRef.handleAdjustmentChange(fineTuneActiveAdjustment, value);
									}
								}}
								onComparisonStart={() => {
									if (fineTuneRef && fineTuneRef.startComparison) {
										fineTuneRef.startComparison();
									}
								}}
								onComparisonEnd={() => {
									if (fineTuneRef && fineTuneRef.endComparison) {
										fineTuneRef.endComparison();
									}
								}}
								onReset={() => {
									if (fineTuneRef && fineTuneRef.resetAdjustments) {
										fineTuneRef.resetAdjustments();
									}
								}}
								onApply={() => {
									if (fineTuneRef && fineTuneRef.applyFineTunePermanently) {
										fineTuneRef.applyFineTunePermanently();
										// Apply the edit after a short delay to ensure the image is updated
										setTimeout(() => {
											applyEdit();
											imageEditorStore.setActiveState('');
										}, 100);
									}
								}}
								onAdjustmentChange={(adjustment: string) => (fineTuneActiveAdjustment = adjustment as AdjustmentKey)}
							/>
						{/if}

						<!-- Watermark Top Toolbar - overlaid on canvas -->
						{#if activeState === 'watermark' && watermarkToolRef}
							<WatermarkTopToolbar
								stickers={watermarkPanelData.stickers}
								selectedSticker={watermarkPanelData.selectedSticker}
								onAddSticker={() => watermarkToolRef?.openFileDialog()}
								onDeleteSelected={() => watermarkToolRef?.deleteSelectedSticker()}
								onBringToFront={() => watermarkToolRef?.bringToFront()}
								onSendToBack={() => watermarkToolRef?.sendToBack()}
								onReset={() => {
									watermarkToolRef?.deleteAllStickers();
								}}
								onDone={() => {
									imageEditorStore.cleanupToolSpecific('watermark');
									imageEditorStore.setActiveState('');
									applyEdit();
								}}
							/>
						{/if}

						<!-- Annotate Top Toolbar - overlaid on canvas -->
						{#if activeState === 'annotate'}
							<AnnotateTopToolbar
								bind:currentTool={annotateCurrentTool}
								bind:strokeColor={annotateStrokeColor}
								bind:fillColor={annotateFillColor}
								bind:strokeWidth={annotateStrokeWidth}
								bind:fontSize={annotateFontSize}
								onDelete={() => annotateToolRef?.deleteSelected()}
								onDeleteAll={() => annotateToolRef?.deleteAll()}
								onDone={() => {
									annotateToolRef?.apply();
									applyEdit();
									imageEditorStore.cleanupToolSpecific('annotate');
									imageEditorStore.setActiveState('');
								}}
							/>
						{/if}
					</EditorCanvas>
					<!-- Crop Bottom Bar - below canvas -->
					{#if activeState === 'crop'}
						<CropBottomBar
							bind:activeMode={cropMode}
							onModeChange={(mode) => (cropMode = mode)}
							bind:rotationAngle={cropRotationAngle}
							onRotationChange={(angle) => (cropRotationAngle = angle)}
							bind:scaleValue={cropScaleValue}
							onScaleChange={(scale) => (cropScaleValue = scale)}
						/>
					{/if}
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
						<button onclick={handleCancel} class="bg-surface-500/10 text-surface-500 hover:bg-surface-500/20 btn-icon" aria-label="Cancel editing">
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
						<button onclick={handleSave} class="bg-primary-500 text-white btn btn-sm"> Save </button>
					{/if}
				</div>
			</div>

			<!-- Canvas (Mobile) -->
			<div class="canvas-wrapper-mobile">
				<EditorCanvas bind:containerRef hasImage={!!storeState.imageNode}>
					<!-- Render tool components here so they can be controlled -->
					{#if storeState.stage && storeState.layer && storeState.imageNode && storeState.imageGroup}
						<Crop
							bind:this={cropToolRef}
							bind:rotationAngle={cropRotationAngle}
							bind:scaleValue={cropScaleValue}
							stage={storeState.stage}
							layer={storeState.layer}
							imageNode={storeState.imageNode}
							container={storeState.imageGroup}
							onApply={(cropData) => {
								const { imageNode, imageGroup, layer, stage } = imageEditorStore.state;
								if (!imageNode || !imageGroup || !layer || !stage) return;

								// Apply crop transformation
								const { x, y, width, height, isCircular } = cropData;

								// Validate crop dimensions
								if (width <= 0 || height <= 0) {
									logger.error('Invalid crop dimensions:', { width, height });
									imageEditorStore.setActiveState('');
									return;
								}

								// Set crop properties on the image node
								imageNode.setAttrs({
									cropX: x,
									cropY: y,
									cropWidth: width,
									cropHeight: height,
									width: width,
									height: height,
									x: -width / 2,
									y: -height / 2
								});

								// Apply circular clipping if needed
								if (isCircular) {
									// Create an off-screen canvas to create circular mask
									const offCanvas = document.createElement('canvas');
									const offCtx = offCanvas.getContext('2d');

									if (offCtx && imageNode.image()) {
										const img = imageNode.image() as HTMLImageElement;
										offCanvas.width = width;
										offCanvas.height = height;

										// Draw circular clip path
										const radius = Math.min(width, height) / 2;
										offCtx.beginPath();
										offCtx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
										offCtx.closePath();
										offCtx.clip();

										// Draw the cropped portion of the image
										offCtx.drawImage(
											img,
											x,
											y,
											width,
											height, // Source rectangle
											0,
											0,
											width,
											height // Destination rectangle
										);

										// Create a new image from the masked canvas
										const circularImg = new Image();
										circularImg.onload = () => {
											imageNode.image(circularImg);
											imageNode.setAttrs({
												cropX: 0,
												cropY: 0,
												cropWidth: width,
												cropHeight: height
											});
											layer.batchDraw();
										};
										circularImg.src = offCanvas.toDataURL();
									}
								}

								// Recenter and rescale the image group to fit the cropped size
								const stageWidth = stage.width();
								const stageHeight = stage.height();

								// Calculate scale based on the NEW cropped dimensions
								// This ensures we fit the cropped area to 80% of stage
								const scaleX = (stageWidth * 0.8) / width;
								const scaleY = (stageHeight * 0.8) / height;
								const scale = Math.min(scaleX, scaleY);

								// Preserve existing flip states ONLY (not scale)
								const currentScaleX = imageGroup.scaleX();
								const currentScaleY = imageGroup.scaleY();
								const flipX = currentScaleX < 0 ? -1 : 1;
								const flipY = currentScaleY < 0 ? -1 : 1;

								// Store the rotation before resetting
								const currentRotation = imageGroup.rotation();

								// Reset imageGroup transform completely
								imageGroup.x(stageWidth / 2);
								imageGroup.y(stageHeight / 2);
								imageGroup.scaleX(scale * flipX);
								imageGroup.scaleY(scale * flipY);
								imageGroup.rotation(currentRotation);

								// Force redraw to apply changes
								layer.batchDraw();
								stage.batchDraw();

								// THEN: Exit crop mode and do final cleanup after a short delay
								setTimeout(() => {
									// Final cleanup to catch any stragglers
									imageEditorStore.cleanupToolSpecific('crop');
									imageEditorStore.setActiveState('');
									applyEdit();
								}, 50);
							}}
						/>
						<FineTune bind:this={fineTuneRef} />
						<Blur bind:this={blurToolRef} />
						<Watermark bind:this={watermarkToolRef} stage={storeState.stage} layer={storeState.layer} imageNode={storeState.imageNode} />
						<Annotate
							bind:this={annotateToolRef}
							stage={storeState.stage}
							layer={storeState.layer}
							imageNode={storeState.imageNode}
							bind:strokeColor={annotateStrokeColor}
							bind:fillColor={annotateFillColor}
							bind:strokeWidth={annotateStrokeWidth}
							bind:fontSize={annotateFontSize}
							onAnnotationChange={() => {
								applyEdit();
							}}
						/>
					{/if}

					<!-- Crop Top Toolbar - overlaid on canvas -->
					{#if activeState === 'crop'}
						<CropTopToolbar
							onRotateLeft={() => cropToolRef?.rotateLeft()}
							onFlipHorizontal={() => cropToolRef?.flipHorizontal()}
							{cropShape}
							onCropShapeChange={(shape) => cropToolRef?.setCropShape(shape)}
							onDone={() => cropToolRef?.apply()}
						/>
					{/if}

					<!-- Blur Top Toolbar - overlaid on canvas -->
					{#if activeState === 'blur' && blurToolRef}
						<BlurTopToolbar
							bind:blurStrength
							onBlurStrengthChange={(value) => {
								blurStrength = value;
								blurToolRef?.updateBlurStrength();
							}}
							onReset={() => blurToolRef?.reset()}
							onApply={() => {
								blurToolRef?.apply();
								applyEdit();
								imageEditorStore.setActiveState('');
							}}
						/>
					{/if}

					<!-- FineTune Top Toolbar - overlaid on canvas -->
					{#if activeState === 'finetune' && fineTuneRef}
						<FineTuneTopToolbar
							activeAdjustment={fineTuneActiveAdjustment}
							adjustmentValue={fineTuneRef?.adjustments?.[fineTuneActiveAdjustment] || 0}
							onValueChange={(value) => {
								if (fineTuneRef && fineTuneRef.handleAdjustmentChange) {
									fineTuneRef.handleAdjustmentChange(fineTuneActiveAdjustment, value);
								}
							}}
							onComparisonStart={() => {
								if (fineTuneRef && fineTuneRef.startComparison) {
									fineTuneRef.startComparison();
								}
							}}
							onComparisonEnd={() => {
								if (fineTuneRef && fineTuneRef.endComparison) {
									fineTuneRef.endComparison();
								}
							}}
							onReset={() => {
								if (fineTuneRef && fineTuneRef.resetAdjustments) {
									fineTuneRef.resetAdjustments();
								}
							}}
							onApply={() => {
								if (fineTuneRef && fineTuneRef.applyFineTunePermanently) {
									fineTuneRef.applyFineTunePermanently();
									// Apply the edit after a short delay to ensure the image is updated
									setTimeout(() => {
										applyEdit();
										imageEditorStore.setActiveState('');
									}, 100);
								}
							}}
							onAdjustmentChange={(adjustment: string) => (fineTuneActiveAdjustment = adjustment as AdjustmentKey)}
						/>
					{/if}

					<!-- Watermark Top Toolbar - overlaid on canvas -->
					{#if activeState === 'watermark' && watermarkToolRef}
						<WatermarkTopToolbar
							stickers={watermarkPanelData.stickers}
							selectedSticker={watermarkPanelData.selectedSticker}
							onAddSticker={() => watermarkToolRef?.openFileDialog()}
							onDeleteSelected={() => watermarkToolRef?.deleteSelectedSticker()}
							onBringToFront={() => watermarkToolRef?.bringToFront()}
							onSendToBack={() => watermarkToolRef?.sendToBack()}
							onReset={() => {
								watermarkToolRef?.deleteAllStickers();
							}}
							onDone={() => {
								imageEditorStore.cleanupToolSpecific('watermark');
								imageEditorStore.setActiveState('');
								applyEdit();
							}}
						/>
					{/if}

					<!-- Annotate Top Toolbar - overlaid on canvas -->
					{#if activeState === 'annotate'}
						<AnnotateTopToolbar
							bind:currentTool={annotateCurrentTool}
							bind:strokeColor={annotateStrokeColor}
							bind:fillColor={annotateFillColor}
							bind:strokeWidth={annotateStrokeWidth}
							bind:fontSize={annotateFontSize}
							onDelete={() => annotateToolRef?.deleteSelected()}
							onDeleteAll={() => annotateToolRef?.deleteAll()}
							onDone={() => {
								annotateToolRef?.apply();
								applyEdit();
								imageEditorStore.cleanupToolSpecific('annotate');
								imageEditorStore.setActiveState('');
							}}
						/>
					{/if}
				</EditorCanvas>
			</div>

			<!-- Bottom Toolbar (Mobile) -->
			<MobileToolbar {activeState} onToolSelect={toggleTool} hasImage={!!storeState.imageNode} />
		</div>
	{/if}
</div>

<style lang="postcss">
@import "tailwindcss";
	.image-editor {
		@apply h-full w-full;
	}

	.editor-layout {
		@apply flex h-full;
	}

	.editor-main {
		@apply flex min-w-0 flex-1 flex-col;
	}

	.canvas-wrapper {
		@apply relative flex flex-1 flex-col;
	}

	.editor-controls {
		@apply flex items-center justify-between gap-4 border-b p-4;
		border-color: var(--color-surface-300);
	}

	.controls-left,
	.controls-right {
		@apply flex items-center gap-2;
	}

	.controls-center {
		@apply flex flex-1 items-center justify-center;
	}

	.filename {
		@apply max-w-48 truncate;
	}

	.editor-mobile {
		@apply flex h-full flex-col;
	}

	.mobile-controls {
		@apply flex items-center justify-between gap-2 border-b p-3;
		border-color: var(--color-surface-300);
	}

	.controls-left .btn-icon,
	.controls-right .btn-icon {
		@apply text-surface-600 dark:text-surface-300;
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
