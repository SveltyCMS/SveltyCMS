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

	// Store
	import { saveEditedImage } from '@stores/store.svelte';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';

	// Import individual tool components
	import Crop from './components/Crop.svelte';
	import CropTopToolbar from './components/toolbars/CropTopToolbar.svelte';
	import CropBottomBar from './components/toolbars/CropBottomBar.svelte';
	import Blur from './components/Blur.svelte';
	import BlurTopToolbar from './components/toolbars/BlurTopToolbar.svelte';
	import FocalPoint from './components/FocalPoint.svelte';
	import FocalPointTopToolbar from './components/toolbars/FocalPointTopToolbar.svelte';
	import FineTune from './components/FineTune.svelte';
	import FineTuneTopToolbar from './components/toolbars/FineTuneTopToolbar.svelte';
	import Sticker from './components/Sticker.svelte';
	import StickerTopToolbar from './components/toolbars/StickerTopToolbar.svelte';

	// Layout components
	import EditorSidebar from './components/EditorSidebar.svelte';
	import EditorCanvas from './components/EditorCanvas.svelte';
	import MobileToolbar from './components/MobileToolbar.svelte';

	// Konva
	import Konva from 'konva';

	// Props
	let {
		imageFile = null,
		initialImageSrc = '',
		config = {},
		onSave = null,
		onCancel = null
	}: {
		imageFile?: File | null;
		initialImageSrc?: string;
		config?: any;
		onSave?: ((dataURL: string, file: File) => void) | null;
		onCancel?: (() => void) | null;
	} = $props();

	// Local state
	let selectedImage: string = '';
	let containerRef: HTMLDivElement | undefined = $state();
	let originalImage: HTMLImageElement;
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
	let fineTuneActiveAdjustment = $state('brightness');

	// Blur tool state and reference
	let blurToolRef: Blur | null = $state(null);
	let blurStrength = $state(10);

	// Focal point tool state and reference
	let focalPointToolRef: FocalPoint | null = $state(null);
	let focalPointX = $state(0);
	let focalPointY = $state(0);
	let savedFocalPoint: { x: number; y: number } | null = $state(null); // Store the last applied focal point

	// Sticker tool state and reference
	let stickerToolRef: Sticker | null = $state(null);

	// Derived state for sticker panel - with safety check
	let stickerPanelData = $derived.by(() => {
		try {
			if (!stickerToolRef || typeof stickerToolRef.getStickers !== 'function') {
				return { stickers: [], selectedSticker: null };
			}
			const stickers = stickerToolRef.getStickers();
			const selected = stickerToolRef.getSelectedSticker();
			return {
				stickers: stickers.map((s) => ({ id: s.id, previewUrl: s.previewUrl })),
				selectedSticker: selected ? { id: selected.id, previewUrl: selected.previewUrl } : null
			};
		} catch (e) {
			console.warn('Error getting sticker data:', e);
			return { stickers: [], selectedSticker: null };
		}
	});

	// Debug: Watch cropToolRef changes
	$effect(() => {
		console.log('cropToolRef changed:', cropToolRef);
		console.log('activeState:', activeState);
		console.log('Should show toolbar?', activeState === 'crop' && cropToolRef);
	});

	// Debug: Watch stickerToolRef changes
	$effect(() => {
		console.log('stickerToolRef changed:', stickerToolRef);
		console.log('activeState:', activeState);
		console.log('isMobile:', isMobile, 'isTablet:', isTablet);
		console.log('Should show sticker panel?', activeState === 'sticker' && stickerToolRef);
	});

	// Get store state reactively - since imageEditorStore.state uses $state, it's already reactive
	const storeState = imageEditorStore.state;

	// Derive specific values for better reactivity tracking
	let activeState = $derived(imageEditorStore.state.activeState);
	let stage = $derived(imageEditorStore.state.stage);
	let layer = $derived(imageEditorStore.state.layer);
	let imageNode = $derived(imageEditorStore.state.imageNode);
	let imageGroup = $derived(imageEditorStore.state.imageGroup);

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

	$effect(() => {
		stage = storeState.stage as Konva.Stage | null;
		layer = storeState.layer as Konva.Layer | null;
		imageNode = storeState.imageNode as Konva.Image | null;
		imageGroup = storeState.imageGroup as Konva.Group | null;
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
		function handleFineTuneAdjustment(event: CustomEvent) {
			// Take a snapshot when fine-tune adjustments are made
			takeSnapshot();
		}
		window.addEventListener('fineTuneAdjustment', handleFineTuneAdjustment as EventListener);

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
					imageEditorStore.saveToolState(currentState);
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
			window.removeEventListener('fineTuneAdjustment', handleFineTuneAdjustment as EventListener);
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
			console.error('Container ref not available - this should not happen');
			return;
		}

		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			originalImage = img;

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

			console.log('Restoring state, imageGroup from saved state:', stateJSON.children?.[0]?.children?.[0]?.attrs);

			// Store current filters before clearing them
			const currentFilters = imageNode.filters() || [];

			// Clear filters temporarily to ensure clean state
			imageNode.filters([]);
			imageNode.clearCache();

			// Restore image group properties (position, scale, rotation)
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
					console.log('Restored imageGroup position:', {
						x: imageGroup.x(),
						y: imageGroup.y(),
						scaleX: imageGroup.scaleX(),
						scaleY: imageGroup.scaleY()
					});
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
					if (imageNodeState.attrs.filters && imageNodeState.attrs.filters.length > 0) {
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
			if (imageNode.filters() && imageNode.filters().length > 0) {
				imageNode.cache();
			}

			// Redraw the stage
			layer.batchDraw();
			stage.batchDraw();
		} catch (error) {
			console.error('Failed to restore from state data:', error);
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
			console.error('No stage or file available for saving');
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
			if (savedFocalPoint) {
				formData.append('focalPoint', JSON.stringify(savedFocalPoint));
				console.log('Saving image with focal point:', savedFocalPoint);
			}

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

			console.log('Image saved successfully:', result.data);
		} catch (error) {
			console.error('Error saving image:', error);

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
		console.log('toggleTool called:', { tool, currentState });

		// Save the current tool state before switching
		if (currentState && currentState !== tool) {
			imageEditorStore.saveToolState(currentState);
			// Use tool-specific cleanup for better artifact removal
			imageEditorStore.cleanupToolSpecific(currentState);
		}

		const newState = currentState === tool ? '' : tool;
		console.log('Setting new state:', newState);
		imageEditorStore.setActiveState(newState);
		console.log('After setting, store state is:', imageEditorStore.state.activeState);
		console.log('Derived activeState is:', activeState);
	}

	// Tool event handlers
	function handleCrop(cropData: any) {
		const { imageNode, imageGroup, layer, stage } = imageEditorStore.state;
		if (!imageNode || !imageGroup || !layer || !stage) return;

		console.log('handleCrop called with:', cropData);
		console.log('BEFORE crop - imageGroup position:', {
			x: imageGroup.x(),
			y: imageGroup.y(),
			scaleX: imageGroup.scaleX(),
			scaleY: imageGroup.scaleY()
		});

		// Apply crop transformation
		const { x, y, width, height } = cropData;

		// Validate crop dimensions
		if (width <= 0 || height <= 0) {
			console.error('Invalid crop dimensions:', { width, height });
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

		console.log('Image node after crop:', {
			cropX: imageNode.cropX(),
			cropY: imageNode.cropY(),
			cropWidth: imageNode.cropWidth(),
			cropHeight: imageNode.cropHeight(),
			width: imageNode.width(),
			height: imageNode.height()
		});

		// Recenter and rescale the image group to fit the cropped size
		const stageWidth = stage.width();
		const stageHeight = stage.height();
		const scaleX = (stageWidth * 0.8) / width;
		const scaleY = (stageHeight * 0.8) / height;
		const scale = Math.min(scaleX, scaleY);

		// Preserve existing rotation and flip states
		const currentScaleX = imageGroup.scaleX();
		const currentScaleY = imageGroup.scaleY();
		const flipX = currentScaleX < 0 ? -1 : 1;
		const flipY = currentScaleY < 0 ? -1 : 1;

		imageGroup.position({
			x: stageWidth / 2,
			y: stageHeight / 2
		});
		imageGroup.scale({ x: scale * flipX, y: scale * flipY });
		// Keep rotation as-is

		console.log('AFTER crop - imageGroup position:', {
			x: imageGroup.x(),
			y: imageGroup.y(),
			scaleX: imageGroup.scaleX(),
			scaleY: imageGroup.scaleY()
		});

		// Force redraw to apply changes
		layer.batchDraw();
		stage.batchDraw();

		// THEN: Exit crop mode and do final cleanup after a short delay
		setTimeout(() => {
			// Final cleanup to catch any stragglers
			imageEditorStore.cleanupToolSpecific('crop');
			imageEditorStore.setActiveState('');
			console.log('BEFORE applyEdit() - imageGroup position:', {
				x: imageGroup.x(),
				y: imageGroup.y(),
				scaleX: imageGroup.scaleX(),
				scaleY: imageGroup.scaleY()
			});
			applyEdit();
		}, 50);
	}

	function handleRotate(angle: number) {
		const { imageGroup, layer } = imageEditorStore.state;
		if (!imageGroup || !layer) return;

		imageGroup.rotation(angle);
		layer.batchDraw();
		applyEdit();
	}
</script>

<div class="image-editor" class:mobile={isMobile} class:tablet={isTablet} role="application" aria-label="Image editor">
	<!-- Desktop/Tablet Layout -->
	{#if !isMobile}
		<div class="editor-layout">
			<!-- Left Sidebar -->
			<EditorSidebar {activeState} onToolSelect={toggleTool} hasImage={!!storeState.file} />

			<!-- Main Canvas Area -->
			<div class="editor-main">
				<!-- Top Controls -->
				<div class="editor-controls">
					<div class="controls-left">
						<div class="file-upload">
							<input id="image-upload" class="sr-only" type="file" accept="image/*" onchange={handleImageUpload} aria-label="Upload image file" />
							<label for="image-upload" class="variant-filled-primary btn">
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
									class="variant-soft-surface btn-icon"
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
									class="variant-soft-surface btn-icon"
									title="Redo (Ctrl+Shift+Z)"
								>
									<iconify-icon icon="mdi:redo" width="20"></iconify-icon>
								</button>
								<span id="redo-shortcut" class="sr-only">Keyboard shortcut: Ctrl+Shift+Z or Cmd+Shift+Z</span>
							</div>
							<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>
							<button onclick={handleSave} aria-label="Save edited image" class="variant-filled-success btn" title="Save Image">
								<iconify-icon icon="material-symbols:save" width="18" class="mr-2"></iconify-icon>
								Save
							</button>
						{/if}
						{#if onCancel}
							<button onclick={handleCancel} aria-label="Cancel" class="variant-outline-surface btn"> Cancel </button>
						{/if}
					</div>
				</div>

				<!-- Canvas Container -->
				<div class="canvas-wrapper">
					<EditorCanvas bind:containerRef hasImage={!!storeState.file} role="region" aria-label="Image editing canvas">
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
								onApply={() => blurToolRef?.apply()}
							/>
						{/if}

						<!-- Focal Point Top Toolbar - overlaid on canvas -->
						{#if activeState === 'focalpoint' && focalPointToolRef}
							<FocalPointTopToolbar
								{focalPointX}
								{focalPointY}
								onReset={() => focalPointToolRef?.reset()}
								onRemove={() => {
									focalPointToolRef?.remove();
									focalPointX = 0;
									focalPointY = 0;
								}}
								onDone={() => {
									const focalData = focalPointToolRef?.apply();
									console.log('Focal point applied:', focalData);
									// Save the focal point data
									if (focalData) {
										savedFocalPoint = focalData;
									}
									focalPointToolRef?.cleanup();
									imageEditorStore.cleanupToolSpecific('focalpoint');
									imageEditorStore.setActiveState('');
									applyEdit();
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
											const { imageGroup } = imageEditorStore.state;
											console.log('FineTune onApply - BEFORE applyEdit():', {
												x: imageGroup?.x(),
												y: imageGroup?.y(),
												scaleX: imageGroup?.scaleX(),
												scaleY: imageGroup?.scaleY()
											});
											applyEdit();
											console.log('FineTune onApply - AFTER applyEdit():', {
												x: imageGroup?.x(),
												y: imageGroup?.y(),
												scaleX: imageGroup?.scaleX(),
												scaleY: imageGroup?.scaleY()
											});
											imageEditorStore.setActiveState('');
											console.log('FineTune onApply - AFTER setActiveState:', {
												x: imageGroup?.x(),
												y: imageGroup?.y(),
												scaleX: imageGroup?.scaleX(),
												scaleY: imageGroup?.scaleY()
											});
										}, 100);
									}
								}}
								onAdjustmentChange={(adjustment) => (fineTuneActiveAdjustment = adjustment)}
							/>
						{/if}

						<!-- Sticker Top Toolbar - overlaid on canvas -->
						{#if activeState === 'sticker' && stickerToolRef}
							<StickerTopToolbar
								stickers={stickerPanelData.stickers}
								selectedSticker={stickerPanelData.selectedSticker}
								onAddSticker={() => stickerToolRef?.openFileDialog()}
								onDeleteSelected={() => stickerToolRef?.deleteSelectedSticker()}
								onBringToFront={() => stickerToolRef?.bringToFront()}
								onSendToBack={() => stickerToolRef?.sendToBack()}
								onReset={() => {
									stickerToolRef?.deleteAllStickers();
								}}
								onDone={() => {
									imageEditorStore.cleanupToolSpecific('sticker');
									imageEditorStore.setActiveState('');
									applyEdit();
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
						<button onclick={handleCancel} class="variant-ghost btn-icon">
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
				<EditorCanvas bind:containerRef hasImage={!!storeState.file}>
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
							onApply={() => blurToolRef?.apply()}
						/>
					{/if}

					<!-- Focal Point Top Toolbar - overlaid on canvas -->
					{#if activeState === 'focalpoint' && focalPointToolRef}
						<FocalPointTopToolbar
							{focalPointX}
							{focalPointY}
							onReset={() => focalPointToolRef?.reset()}
							onRemove={() => {
								focalPointToolRef?.remove();
								focalPointX = 0;
								focalPointY = 0;
							}}
							onDone={() => {
								const focalData = focalPointToolRef?.apply();
								console.log('Focal point applied:', focalData);
								// Save the focal point data
								if (focalData) {
									savedFocalPoint = focalData;
								}
								focalPointToolRef?.cleanup();
								imageEditorStore.cleanupToolSpecific('focalpoint');
								imageEditorStore.setActiveState('');
								applyEdit();
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
							onAdjustmentChange={(adjustment) => (fineTuneActiveAdjustment = adjustment)}
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

			<!-- Mobile Toolbar -->
			<MobileToolbar
				{activeState}
				onToolSelect={toggleTool}
				onImageUpload={handleImageUpload}
				onUndo={handleUndo}
				onRedo={handleRedo}
				canUndo={imageEditorStore.canUndoState}
				canRedo={imageEditorStore.canRedoState}
				hasImage={!!storeState.file}
			/>
		</div>
	{/if}

	<!-- Tool Interfaces -->
	<div class="tool-interfaces" role="region" aria-label="Editing tools">
		{#if stage && layer && imageNode}
			<!-- Conditionally display the tool components based on the active state -->
			{#if activeState === 'rotate'}
				<Rotate
					{stage}
					{layer}
					{imageNode}
					imageGroup={storeState.imageGroup}
					onRotate={handleRotate}
					onRotateApplied={() => {
						imageEditorStore.cleanupToolSpecific('rotate');
						imageEditorStore.setActiveState('');
						applyEdit();
					}}
					onRotateCancelled={() => {
						imageEditorStore.cleanupToolSpecific('rotate');
						imageEditorStore.setActiveState('');
					}}
				/>
			{:else if activeState === 'blur'}
				{#key `blur-${storeState.file?.name || 'unknown'}`}
					<Blur
						bind:this={blurToolRef}
						{stage}
						{layer}
						{imageNode}
						bind:blurStrength
						onBlurApplied={() => {
							imageEditorStore.cleanupToolSpecific('blur');
							imageEditorStore.setActiveState('');
							applyEdit();
						}}
						onBlurReset={() => {
							imageEditorStore.cleanupToolSpecific('blur');
							imageEditorStore.setActiveState('');
						}}
					/>
				{/key}
			{:else if activeState === 'crop'}
				<Crop
					bind:this={cropToolRef}
					{stage}
					{layer}
					{imageNode}
					container={storeState.imageGroup}
					bind:cropShape
					bind:rotationAngle={cropRotationAngle}
					bind:scaleValue={cropScaleValue}
					onApply={handleCrop}
					onCancel={() => {
						imageEditorStore.cleanupToolSpecific('crop');
						imageEditorStore.setActiveState('');
					}}
				/>
			{:else if activeState === 'focalpoint'}
				<FocalPoint
					bind:this={focalPointToolRef}
					{stage}
					{layer}
					{imageNode}
					onFocalpoint={(data) => {
						focalPointX = data.x;
						focalPointY = data.y;
					}}
				/>
			{:else if activeState === 'sticker'}
				{#key `sticker-${storeState.file?.name || 'unknown'}`}
					<Sticker bind:this={stickerToolRef} {stage} {layer} {imageNode} onStickerChange={() => applyEdit()} />
				{/key}
			{:else if activeState === 'finetune'}
				{#key `finetune-${storeState.file?.name || 'unknown'}`}
					<FineTune
						bind:this={fineTuneRef}
						{stage}
						{layer}
						{imageNode}
						activeAdjustment={fineTuneActiveAdjustment}
						onActiveAdjustmentChange={(adjustment) => (fineTuneActiveAdjustment = adjustment)}
						onFineTuneApplied={() => {
							// Just exit the tool - applyEdit is now called in the Apply button handler
							imageEditorStore.cleanupToolSpecific('finetune');
							imageEditorStore.setActiveState('');
						}}
						onFineTuneReset={() => {
							imageEditorStore.cleanupToolSpecific('finetune');
							imageEditorStore.setActiveState('');
						}}
					/>
				{/key}
			{/if}
		{/if}
	</div>
</div>

<div class="success-message" role="alert" aria-live="assertive">Image saved successfully!</div>

<style>
	.image-editor {
		@apply h-full w-full;
	}

	.editor-layout {
		@apply flex h-full;
	}

	.editor-main {
		@apply flex min-w-0 flex-1 flex-col;
	}

	.canvas-wrapper,
	.canvas-wrapper-mobile {
		@apply relative flex flex-1 flex-col;
	}

	.editor-controls {
		@apply flex items-center justify-between gap-4 border-b p-4;
		background-color: rgb(var(--color-surface-50) / 1);
		border-color: rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .editor-controls {
		background-color: rgb(var(--color-surface-900) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
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
		background-color: rgb(var(--color-surface-50) / 1);
		border-color: rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .mobile-controls {
		background-color: rgb(var(--color-surface-900) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.tool-interfaces {
		@apply relative;
	}

	.success-message {
		position: fixed;
		bottom: 20px;
		right: 20px;
		background-color: #4caf50;
		color: white;
		padding: 15px;
		border-radius: 5px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		opacity: 0;
		transition: opacity 0.3s ease;
		z-index: 1000;
	}

	.success-message.show {
		opacity: 1;
	}

	/* Responsive utilities */
	.mobile .editor-layout {
		display: none;
	}

	.tablet .editor-layout {
		@apply grid grid-cols-[auto_1fr];
	}

	:global(.mobile .editor-mobile) {
		@apply flex;
	}

	:global(.tablet .editor-mobile, .desktop .editor-mobile) {
		display: none;
	}
</style>
