<!--
@file: /src/routes/(app)/imageEditor/ImageEditor.svelte
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
	import Crop from './Crop.svelte';
	import CropTopToolbar from './CropTopToolbar.svelte';
	import CropBottomBar from './CropBottomBar.svelte';
	import Blur from './Blur.svelte';
	import Rotate from './Rotate.svelte';
	import Zoom from './Zoom.svelte';
	import FocalPoint from './FocalPoint.svelte';
	import Watermark from './Watermark.svelte';
	import Filter from './Filter.svelte';
	import TextOverlay from './TextOverlay.svelte';
	import ShapeOverlay from './ShapeOverlay.svelte';

	// New layout components
	import EditorSidebar from './EditorSidebar.svelte';
	import EditorCanvas from './EditorCanvas.svelte';
	import EditorToolPanel from './EditorToolPanel.svelte';
	import MobileToolbar from './MobileToolbar.svelte';

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

	// Debug: Watch cropToolRef changes
	$effect(() => {
		console.log('cropToolRef changed:', cropToolRef);
		console.log('activeState:', activeState);
		console.log('Should show toolbar?', activeState === 'crop' && cropToolRef);
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

		// Add keyboard event listener for Esc key
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				const currentState = imageEditorStore.state.activeState;
				if (currentState) {
					imageEditorStore.setActiveState('');
					imageEditorStore.cleanupTempNodes();
				}
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
		const { stage, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !imageNode || !imageGroup) return;

		try {
			const dataURL = stage.toDataURL();
			const snapshot = {
				dataURL,
				imageProps: {
					width: imageNode.width(),
					height: imageNode.height(),
					x: imageNode.x(),
					y: imageNode.y(),
					originalImageSrc: originalImage?.src
				},
				group: {
					x: imageGroup.x(),
					y: imageGroup.y(),
					rotation: imageGroup.rotation(),
					scaleX: imageGroup.scaleX(),
					scaleY: imageGroup.scaleY()
				}
			};

			imageEditorStore.addEditAction(snapshot);
		} catch (error) {
			console.warn('Failed to take snapshot:', error);
		}
	}

	function applyEdit() {
		takeSnapshot();
	}

	function handleUndo() {
		if (!imageEditorStore.canUndoState) return;

		const snapshot = imageEditorStore.undo();
		if (snapshot) {
			restoreFromSnapshot(snapshot);
		}
	}

	function handleRedo() {
		if (!imageEditorStore.canRedoState) return;

		const snapshot = imageEditorStore.redo();
		if (snapshot) {
			restoreFromSnapshot(snapshot);
		}
	}

	function restoreFromSnapshot(snapshot: any) {
		const { imageNode, imageGroup, layer } = imageEditorStore.state;
		if (!imageNode || !imageGroup || !layer) return;

		// Restore with original image if available
		if (snapshot.imageProps?.originalImageSrc && originalImage) {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => {
				originalImage = img;
				imageNode.image(img);
				imageNode.setAttrs({
					width: snapshot.imageProps!.width,
					height: snapshot.imageProps!.height,
					x: snapshot.imageProps!.x,
					y: snapshot.imageProps!.y
				});
				if (snapshot.group && imageGroup) {
					imageGroup.rotation(snapshot.group.rotation);
					imageGroup.position({ x: snapshot.group.x, y: snapshot.group.y });
					imageGroup.scale({ x: snapshot.group.scaleX, y: snapshot.group.scaleY });
				}
				layer?.draw();
			};
			img.src = snapshot.imageProps.originalImageSrc || imageNode.image()?.src || snapshot.dataURL;
			return;
		}

		// Fallback: raster snapshot only
		const img = new Image();
		img.onload = () => {
			imageNode.image(img);
			if (snapshot.group && imageGroup) {
				imageGroup.rotation(snapshot.group.rotation);
				imageGroup.position({ x: snapshot.group.x, y: snapshot.group.y });
				imageGroup.scale({ x: snapshot.group.scaleX, y: snapshot.group.scaleY });
			}
			layer?.draw();
		};
		img.src = snapshot.dataURL;
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
		if (stage && file) {
			const dataURL = stage.toDataURL();

			// Call custom save handler if provided
			if (onSave) {
				onSave(dataURL, file);
				return;
			}

			// Default save behavior
			const response = await fetch(dataURL);
			await response.blob();

			saveEditedImage.set(true);

			// Show saved notification
			const notification = document.querySelector('.success-message');
			if (notification) {
				notification.classList.add('show');
				setTimeout(() => {
					notification.classList.remove('show');
				}, 3000);
			}
		}
	}

	function handleCancel() {
		if (onCancel) {
			onCancel();
		}
	}

	function toggleTool(tool: string) {
		const currentState = imageEditorStore.state.activeState;
		console.log('toggleTool called:', { tool, currentState });

		// Cleanup any temporary nodes left by previous tool before switching
		if (currentState && currentState !== tool) {
			imageEditorStore.cleanupTempNodes();

			// Extra cleanup for blur tool specifically
			if (currentState === 'blur') {
				const { layer } = imageEditorStore.state;
				if (layer) {
					layer.getChildren().forEach((node) => {
						if (node.name() && node.name().includes('blur')) {
							try {
								node.destroy();
							} catch {}
						}
						if (node.getClassName() === 'Rect' && node.dash && node.dash().length > 0) {
							try {
								node.destroy();
							} catch {}
						}
						if (node.getClassName() === 'Transformer' && (node as Konva.Transformer).getNodes().length === 0) {
							try {
								node.destroy();
							} catch {}
						}
					});
					layer.batchDraw();
				}
			}
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

		// Force redraw to apply changes
		layer.batchDraw();
		stage.batchDraw();

		// THEN: Exit crop mode and do final cleanup after a short delay
		setTimeout(() => {
			// Final cleanup to catch any stragglers
			imageEditorStore.cleanupTempNodes();
			imageEditorStore.setActiveState('');
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

<div class="image-editor" class:mobile={isMobile} class:tablet={isTablet}>
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
							</label>
						</div>
					</div>

					<div class="controls-center">
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
									aria-label="Undo"
									class="variant-soft-surface btn-icon"
									title="Undo (Ctrl+Z)"
								>
									<iconify-icon icon="mdi:undo" width="20"></iconify-icon>
								</button>
								<button
									onclick={handleRedo}
									disabled={!imageEditorStore.canRedoState}
									aria-label="Redo"
									class="variant-soft-surface btn-icon"
									title="Redo (Ctrl+Shift+Z)"
								>
									<iconify-icon icon="mdi:redo" width="20"></iconify-icon>
								</button>
							</div>
							<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>
							<button onclick={handleSave} aria-label="Save" class="variant-filled-success btn" title="Save Image">
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
					<EditorCanvas bind:containerRef hasImage={!!storeState.file}>
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
				<div class="controls-center">
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
	<div class="tool-interfaces">
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
						imageEditorStore.setActiveState('');
						applyEdit();
					}}
					onRotateCancelled={() => {
						imageEditorStore.setActiveState('');
					}}
				/>
			{:else if activeState === 'blur'}
				{#key `blur-${storeState.file?.name || 'unknown'}`}
					<Blur
						{stage}
						{layer}
						{imageNode}
						onBlurApplied={() => {
							imageEditorStore.setActiveState('');
							applyEdit();
						}}
						onBlurReset={() => {
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
						imageEditorStore.setActiveState('');
					}}
				/>
			{:else if activeState === 'zoom'}
				<Zoom
					{stage}
					{layer}
					{imageNode}
					imageGroup={storeState.imageGroup}
					onZoomApplied={() => {
						imageEditorStore.setActiveState('');
						applyEdit();
					}}
					onZoomCancelled={() => {
						imageEditorStore.setActiveState('');
					}}
				/>
			{:else if activeState === 'focalpoint'}
				<FocalPoint
					{stage}
					{layer}
					{imageNode}
					onFocalpointApplied={() => {
						imageEditorStore.cleanupTempNodes();
						imageEditorStore.setActiveState('');
						applyEdit();
					}}
					onFocalpointRemoved={() => {
						imageEditorStore.cleanupTempNodes();
						imageEditorStore.setActiveState('');
					}}
				/>
			{:else if activeState === 'watermark'}
				<Watermark
					{stage}
					{layer}
					{imageNode}
					onWatermarkChange={() => applyEdit()}
					onExitWatermark={() => {
						imageEditorStore.setActiveState('');
						applyEdit();
					}}
				/>
			{:else if activeState === 'filter'}
				<Filter
					{stage}
					{layer}
					{imageNode}
					onFilterApplied={() => {
						imageEditorStore.setActiveState('');
						applyEdit();
					}}
					onFilterReset={() => {
						imageEditorStore.setActiveState('');
					}}
				/>
			{:else if activeState === 'textoverlay'}
				<TextOverlay
					{stage}
					{layer}
					onTextAdded={() => applyEdit()}
					onExitText={() => {
						imageEditorStore.setActiveState('');
					}}
				/>
			{:else if activeState === 'shapeoverlay'}
				<ShapeOverlay
					{stage}
					{layer}
					onShapeAdded={() => applyEdit()}
					onExitShape={() => {
						imageEditorStore.setActiveState('');
					}}
				/>
			{/if}
		{/if}
	</div>
</div>

<div class="success-message" role="alert">Image saved successfully!</div>

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
