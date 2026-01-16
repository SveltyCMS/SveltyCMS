<!--
@file: src/components/imageEditor/Editor.svelte
@component
**Main reusable Image Editor component with modern UX**
A comprehensive image editing interface with left sidebar tools, responsive design,
and unified tool experiences (crop includes rotation, scale, flip).

#### Props
- `imageFile` (optional): File object of the image to edit
- `initialImageSrc` (optional): URL/path to initial image
- `config` (optional): Editor configuration options
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { logger } from '@utils/logger';

	// Store
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';

	// Layout components
	import EditorSidebar from './EditorSidebar.svelte';
	import EditorCanvas from './EditorCanvas.svelte';
	import FocalPoint from './FocalPoint.svelte';

	import { updateMediaMetadata } from '@utils/media/api';

	// Konva
	import Konva from 'konva';

	// Widgets registry
	import { editorWidgets } from './widgets/registry';

	let activeToolComponent = $state<any>(null);

	$effect(() => {
		const state = imageEditorStore.state.activeState;
		if (state) {
			const widget = editorWidgets.find((w) => w.key === state);
			if (widget) {
				activeToolComponent = widget.tool;
			} else {
				activeToolComponent = null;
			}
		} else {
			activeToolComponent = null;
		}
	});

	// Props
	const {
		imageFile = null,
		initialImageSrc = '',
		mediaId = null,
		focalPoint = { x: 50, y: 50 },
		onsave = () => {},
		oncancel = () => {}
	}: {
		imageFile?: File | null;
		initialImageSrc?: string;
		mediaId?: string | null;
		focalPoint?: { x: number; y: number };
		onsave?: (detail: { dataURL: string; file: File }) => void;
		oncancel?: () => void;
	} = $props();

	// Local state
	let selectedImage: string = '';
	let containerRef = $state<HTMLDivElement | undefined>(undefined);

	// Get store state reactively - since imageEditorStore.state uses
	const storeState = imageEditorStore.state;

	// Derive specific values for better reactivity tracking
	const activeState = $derived(imageEditorStore.state.activeState);

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
		logger.debug('ImageEditor Effect Triggered', { containerRef: !!containerRef, initialImageLoaded, initialImageSrc, imageFile: !!imageFile });
		if (containerRef && !initialImageLoaded && (initialImageSrc || imageFile)) {
			// Load initial image if provided
			if (initialImageSrc) {
				logger.debug('Loading initial image from src:', initialImageSrc);
				selectedImage = initialImageSrc;
				loadImageAndSetupKonva(selectedImage);
				initialImageLoaded = true;
			} else if (imageFile) {
				logger.debug('Loading initial image from file');
				selectedImage = URL.createObjectURL(imageFile);
				loadImageAndSetupKonva(selectedImage, imageFile);
				initialImageLoaded = true;
			}
		}
	});

	onMount(() => {
		// Reset the image editor store for clean state
		imageEditorStore.reset();

		// Add window resize event listener
		window.addEventListener('resize', handleResize);

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
					const deleteBtn = document.querySelector('.preset-filled-error-500.btn') as HTMLButtonElement;
					if (deleteBtn && !deleteBtn.disabled) {
						deleteBtn.click();
					}
				} else if (currentState === 'shapeoverlay') {
					// Trigger delete for selected shape
					const deleteBtn = document.querySelector('.preset-filled-error-500.btn') as HTMLButtonElement;
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
			window.removeEventListener('keydown', handleKeyDown);

			// Force cleanup of all temporary nodes first
			imageEditorStore.cleanupTempNodes();
			// Then reset the store
			imageEditorStore.reset();
		};
	});

	function handleResize() {
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
			imageEditorStore.takeSnapshot();
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

	export function handleUndo() {
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

	export function handleRedo() {
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

	export async function handleSave() {
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

			onsave({ dataURL, file: editedFile });
		} catch (error) {
			logger.error('Error saving image:', error);
			// Optionally dispatch an error event
		}
	}

	export function handleCancel() {
		oncancel();
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

<div class="image-editor flex h-full w-full flex-col overflow-hidden" role="application" aria-label="Image editor">
	<!-- Unified Layout for all screen sizes -->
	<div class="editor-layout flex h-full overflow-hidden">
		<!-- Left Sidebar -->
		<EditorSidebar activeState={activeState ?? ''} onToolSelect={toggleTool} hasImage={!!storeState.imageNode} />

		<!-- Main Canvas Area -->
		<div class="editor-main flex min-w-0 flex-1 flex-col">
			<!-- Canvas Container -->
			<div class="canvas-wrapper relative flex flex-1 flex-col">
				<EditorCanvas bind:containerRef hasImage={!!storeState.imageNode}>
					<!-- Render tool components here so they can be controlled -->
					{#if storeState.stage && storeState.layer && storeState.imageNode && storeState.imageGroup}
						{#if activeState === 'focalpoint'}
							<FocalPoint
								stage={storeState.stage}
								imageNode={storeState.imageNode}
								x={focalPoint?.x}
								y={focalPoint?.y}
								onapply={(detail) => handleApplyFocalPoint(detail)}
							/>
						{/if}
						{#if activeToolComponent}
							{@const Component = activeToolComponent}
							{#if Component}
								<Component />
							{/if}
						{/if}
					{/if}
				</EditorCanvas>
			</div>
		</div>
	</div>
</div>

<style>
	/* Tool-specific overrides */
	:global(.crop-bottom-bar) {
		position: absolute;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
	}
</style>
