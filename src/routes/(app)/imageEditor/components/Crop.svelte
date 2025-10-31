<!--
@file src/routes/(app)/imageEditor/Crop.svelte
@component
**Crop tool - Konva canvas logic only**
Handles crop, rotate, scale transformations on the Konva canvas.
UI components are external (CropTopToolbar, CropBottomBar).

### Props
- `stage`: Konva.Stage - The Konva stage
- `layer`: Konva.Layer - The Konva layer where the image and effects are added
- `imageNode`: Konva.Image - The Konva image node representing the original image
- `container`: Konva.Group - The container group holding the image
- `onApply`: Function called when crop is applied
- `onCancel`: Function called when crop is canceled

### Exports
- `cropShape`: Current crop shape (bindable)
- `rotationAngle`: Current rotation angle (bindable)
- `scaleValue`: Current scale percentage (bindable)
- `rotateLeft()`: Rotate -90 degrees
- `flipHorizontal()`: Flip horizontally
- `setCropShape()`: Change crop shape
- `apply()`: Apply crop and exit
-->
<script lang="ts">
	import Konva from 'konva';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';

	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		imageNode: Konva.Image;
		container: Konva.Group | null;
		cropShape?: 'rectangle' | 'square' | 'circular';
		rotationAngle?: number;
		scaleValue?: number;
		onApply?: (data: {
			x: number;
			y: number;
			width: number;
			height: number;
			rotation: number;
			scaleX: number;
			scaleY: number;
			isCircular?: boolean;
		}) => void;
		onCancel?: () => void;
	}

	let {
		stage,
		layer,
		imageNode,
		container,
		cropShape = $bindable('rectangle'),
		rotationAngle = $bindable(0),
		scaleValue = $bindable(100),
		onApply = () => {},
		onCancel = () => {}
	}: Props = $props();

	// Internal state
	let cropTool = $state<Konva.Rect | Konva.Circle | null>(null);
	let transformer = $state<Konva.Transformer | null>(null);
	let cropOverlay = $state<Konva.Rect | null>(null);
	let cropHighlight = $state<Konva.Rect | Konva.Circle | null>(null);
	let rotationGrid = $state<Konva.Group | null>(null);
	let isFlippedH = $state(false);
	let isFlippedV = $state(false);
	let aspectRatio = $state<string>('free'); // 'free', '1:1', '4:3', '16:9', '3:2', '9:16'

	// Initialize crop tool once on mount
	let mounted = false;

	$effect(() => {
		if (!mounted && stage && layer && imageNode && container) {
			mounted = true;

			return () => {
				cleanupCropTool();
				cleanupRotationGrid();
			};
		}
	});

	// Effect to react to active tool state
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'crop') {
			// Delay slightly to ensure stage is ready after state change
			setTimeout(() => {
				initCropTool();
			}, 10);
		} else {
			cleanupCropTool();
		}
	});

	// ========== CROP FUNCTIONS ==========

	function parseAspectRatio(ratio: string): number | null {
		if (ratio === 'free') return null;
		const [w, h] = ratio.split(':').map(Number);
		return w / h;
	}

	function initCropTool() {
		// Validate required elements
		if (!stage || !layer || !imageNode || !container) {
			console.error('Missing required elements for crop tool initialization');
			return;
		}

		// Clear previous crop tool and transformer
		if (cropTool) cropTool.destroy();
		if (transformer) transformer.destroy();

		// Remove the entire overlay group (contains both overlay and highlight)
		const existingOverlayGroup = layer.findOne('.cropOverlayGroup');
		if (existingOverlayGroup) {
			existingOverlayGroup.destroy();
		}

		// Clear individual references
		cropOverlay = null;
		cropHighlight = null;

		// Get the actual rendered dimensions in stage coordinates
		// The image is inside a transformed container, so we need to get the bounding box
		const containerBox = container.getClientRect();
		const stageWidth = stage.width();
		const stageHeight = stage.height();

		// Validate dimensions
		if (containerBox.width === 0 || containerBox.height === 0) {
			console.error('Container has zero dimensions:', containerBox);
			return;
		}

		// Calculate crop size based on the visible image size
		const visibleWidth = containerBox.width;
		const visibleHeight = containerBox.height;
		const size = Math.min(visibleWidth, visibleHeight) * 0.6; // 60% of smallest dimension

		// Create a group for the overlay effect (dark outside, clear inside)
		// This prevents the cutout from affecting the image layer
		const overlayGroup = new Konva.Group({
			name: 'cropOverlayGroup' // For cleanup
		});

		// Create dark overlay covering entire stage
		cropOverlay = new Konva.Rect({
			x: 0,
			y: 0,
			width: stageWidth,
			height: stageHeight,
			fill: 'rgba(0, 0, 0, 0.7)',
			listening: false,
			name: 'cropOverlay'
		});

		overlayGroup.add(cropOverlay);

		// Initialize the crop tool in stage coordinates (center of visible image)
		const centerX = containerBox.x + containerBox.width / 2;
		const centerY = containerBox.y + containerBox.height / 2;

		// Create the cutout shape (punches hole in overlay within this group only)
		if (cropShape === 'circular') {
			cropHighlight = new Konva.Circle({
				x: centerX,
				y: centerY,
				radius: size / 2,
				fill: 'black',
				globalCompositeOperation: 'destination-out',
				listening: false,
				name: 'cropHighlight'
			});
		} else {
			cropHighlight = new Konva.Rect({
				x: centerX - size / 2,
				y: centerY - (cropShape === 'square' ? size / 2 : (size * 0.75) / 2),
				width: size,
				height: cropShape === 'square' ? size : size * 0.75,
				fill: 'black',
				globalCompositeOperation: 'destination-out',
				listening: false,
				name: 'cropHighlight'
			});
		}

		overlayGroup.add(cropHighlight);

		// CRITICAL: Cache the group to make globalCompositeOperation work
		// Use stage dimensions for cache to avoid dimension errors on resize
		overlayGroup.cache({
			x: 0,
			y: 0,
			width: stageWidth,
			height: stageHeight,
			pixelRatio: 1
		});

		layer.add(overlayGroup);

		// Create the crop tool border
		if (cropShape === 'circular') {
			cropTool = new Konva.Circle({
				x: centerX,
				y: centerY,
				radius: size / 2,
				stroke: 'white',
				strokeWidth: 3,
				draggable: true,
				name: 'cropTool' // For cleanup
			});
		} else {
			cropTool = new Konva.Rect({
				x: centerX - size / 2,
				y: centerY - (cropShape === 'square' ? size / 2 : (size * 0.75) / 2),
				width: size,
				height: cropShape === 'square' ? size : size * 0.75,
				stroke: 'white',
				strokeWidth: 3,
				draggable: true,
				name: 'cropTool' // For cleanup
			});
		}

		layer.add(cropTool);

		// Proper layering: image → overlay group (with cutout) → crop tool border
		container.moveToTop();
		overlayGroup.moveToTop();
		cropTool.moveToTop();

		// Configure the transformer tool
		const ratio = parseAspectRatio(aspectRatio);
		const shouldKeepRatio = cropShape !== 'rectangle' || ratio !== null;

		transformer = new Konva.Transformer({
			nodes: [cropTool],
			keepRatio: shouldKeepRatio,
			enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
			rotateEnabled: true,
			rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
			anchorStrokeWidth: 2,
			anchorSize: 10,
			borderStrokeWidth: 2,
			borderStroke: 'white',
			anchorStroke: 'white',
			anchorFill: '#4f46e5', // Primary color
			rotateAnchorOffset: 30,
			name: 'cropTransformer', // For cleanup
			boundBoxFunc: (oldBox, newBox) => {
				// Limit resize
				if (newBox.width < 30 || newBox.height < 30) {
					return oldBox;
				}

				// Apply aspect ratio constraint if set
				if (ratio !== null && cropShape === 'rectangle') {
					const width = newBox.width;
					const height = width / ratio;
					return {
						...newBox,
						height: Math.max(30, height)
					};
				}

				return newBox;
			}
		});

		layer.add(transformer);
		transformer.moveToTop(); // Ensure transformer is on top

		// Set up interaction handlers
		cropTool.on('transform', () => {
			if (cropTool instanceof Konva.Circle) {
				const scaleX = cropTool.scaleX();
				cropTool.radius(cropTool.radius() * scaleX);
				cropTool.scaleX(1);
				cropTool.scaleY(1);
			}
			// Update highlight with re-caching for smooth visual updates
			updateHighlight();
		});

		cropTool.on('transformend', () => {
			// Final update after transform
			updateHighlight();
		});

		// Add drag boundary to keep crop tool within image bounds
		cropTool.on('dragmove', () => {
			if (!cropTool) return;
			const pos = cropTool.position();
			const bounds = {
				minX: containerBox.x,
				minY: containerBox.y,
				maxX: containerBox.x + containerBox.width,
				maxY: containerBox.y + containerBox.height
			};

			if (cropTool instanceof Konva.Circle) {
				const radius = cropTool.radius();
				pos.x = Math.max(bounds.minX + radius, Math.min(pos.x, bounds.maxX - radius));
				pos.y = Math.max(bounds.minY + radius, Math.min(pos.y, bounds.maxY - radius));
			} else {
				const width = cropTool.width();
				const height = cropTool.height();
				pos.x = Math.max(bounds.minX, Math.min(pos.x, bounds.maxX - width));
				pos.y = Math.max(bounds.minY, Math.min(pos.y, bounds.maxY - height));
			}

			cropTool.position(pos);
			// Update highlight with re-caching for smooth visual updates
			updateHighlight();
		});

		cropTool.on('dragend', () => {
			// Final update after drag
			updateHighlight();
		});

		layer.batchDraw();

		// Force redraw to ensure visibility
		stage.batchDraw();
	}

	function updateHighlight() {
		if (!cropTool || !cropHighlight) return;

		// Get the overlay group
		const overlayGroup = layer.findOne('.cropOverlayGroup') as Konva.Group;
		if (!overlayGroup) return;

		// Clear cache first to prevent checkerboard
		overlayGroup.clearCache();

		// Sync highlight with crop tool's transform properties
		if (cropTool instanceof Konva.Circle && cropHighlight instanceof Konva.Circle) {
			// For circles, sync position and radius
			// Important: circles use x/y for center position, not top-left
			cropHighlight.x(cropTool.x());
			cropHighlight.y(cropTool.y());
			cropHighlight.radius(cropTool.radius());
			cropHighlight.rotation(cropTool.rotation());
			cropHighlight.scaleX(cropTool.scaleX());
			cropHighlight.scaleY(cropTool.scaleY());
		} else if (cropTool instanceof Konva.Rect && cropHighlight instanceof Konva.Rect) {
			// For rectangles, sync all transform properties including rotation
			cropHighlight.x(cropTool.x());
			cropHighlight.y(cropTool.y());
			cropHighlight.width(cropTool.width());
			cropHighlight.height(cropTool.height());
			cropHighlight.rotation(cropTool.rotation());
			cropHighlight.scaleX(cropTool.scaleX());
			cropHighlight.scaleY(cropTool.scaleY());
		}

		// Always re-cache immediately to apply the cutout effect
		const stageWidth = stage.width();
		const stageHeight = stage.height();
		overlayGroup.cache({
			x: 0,
			y: 0,
			width: stageWidth,
			height: stageHeight,
			pixelRatio: 1
		});

		layer.batchDraw();
	}

	function cleanupCropTool() {
		if (cropTool) {
			cropTool.destroy();
			cropTool = null;
		}
		if (transformer) {
			transformer.destroy();
			transformer = null;
		}
		// Remove overlay group (contains both overlay and highlight)
		const overlayGroup = layer.findOne('.cropOverlayGroup');
		if (overlayGroup) {
			overlayGroup.destroy();
		}
		// Also clean individual refs
		if (cropOverlay) {
			cropOverlay = null;
		}
		if (cropHighlight) {
			cropHighlight = null;
		}
		layer.draw();
	}

	// ========== ROTATION FUNCTIONS ==========

	function cleanupRotationGrid() {
		if (rotationGrid) {
			rotationGrid.destroy();
			rotationGrid = null;
			layer.draw();
		}
	}

	function applyRotation() {
		if (container) {
			container.rotation(rotationAngle);
			layer.draw();
		}
	}

	// Watch for rotation angle changes
	let lastAppliedRotation = 0;
	$effect(() => {
		if (rotationAngle !== lastAppliedRotation) {
			lastAppliedRotation = rotationAngle;
			applyRotation();
		}
	});

	// ========== SCALE FUNCTIONS ==========

	function applyScale() {
		if (container) {
			const scale = scaleValue / 100;

			// Get current scale and preserve flip state
			const currentScaleX = container.scaleX();
			const currentScaleY = container.scaleY();
			const flipX = currentScaleX < 0 ? -1 : 1;
			const flipY = currentScaleY < 0 ? -1 : 1;

			// Apply scale while preserving flip state
			container.scale({ x: scale * flipX, y: scale * flipY });

			// Keep container centered - don't change position
			// The container should stay at stage center (set during initialization)
			const stageWidth = stage.width();
			const stageHeight = stage.height();

			container.position({
				x: stageWidth / 2,
				y: stageHeight / 2
			});

			layer.draw();
		}
	}

	// Watch for scale value changes
	let lastAppliedScale = 100;
	$effect(() => {
		if (scaleValue !== lastAppliedScale) {
			lastAppliedScale = scaleValue;
			applyScale();
		}
	});

	// ========== EXPORTED FUNCTIONS ==========

	export function rotateLeft() {
		rotationAngle = (rotationAngle - 90) % 360;
	}

	export function flipHorizontal() {
		isFlippedH = !isFlippedH;
		if (container) {
			container.scaleX(container.scaleX() * -1);
			layer.draw();
		}
	}

	export function flipVertical() {
		isFlippedV = !isFlippedV;
		if (container) {
			container.scaleY(container.scaleY() * -1);
			layer.draw();
		}
	}

	export function setCropShape(shape: 'rectangle' | 'square' | 'circular') {
		cropShape = shape;
		initCropTool();
	}

	export function cleanup() {
		cleanupCropTool();
		cleanupRotationGrid();
	}

	export function setAspectRatio(ratio: string) {
		aspectRatio = ratio;

		// Reinitialize crop tool with new aspect ratio constraint
		if (cropTool && transformer) {
			initCropTool();
		}
	}

	export function apply() {
		if (!cropTool) {
			onApply({ x: 0, y: 0, width: 0, height: 0, rotation: rotationAngle, scaleX: scaleValue / 100, scaleY: scaleValue / 100 });
			return;
		}

		if (!container) return;

		// Get crop tool bounds in stage coordinates BEFORE cleanup
		const cropBox = cropTool.getClientRect();

		// Get container transform to convert from stage space to image space
		const containerTransform = container.getAbsoluteTransform();
		const containerInverse = containerTransform.copy().invert();

		// Convert crop box corners from stage coordinates to image coordinates
		const topLeft = containerInverse.point({ x: cropBox.x, y: cropBox.y });
		const bottomRight = containerInverse.point({
			x: cropBox.x + cropBox.width,
			y: cropBox.y + cropBox.height
		});

		// Get the current image dimensions (might already be cropped)
		const currentWidth = imageNode.width();
		const currentHeight = imageNode.height();

		// Check if image is already cropped
		const existingCropX = imageNode.cropX() || 0;
		const existingCropY = imageNode.cropY() || 0;

		// Calculate crop rectangle in image coordinate space
		// The image node is centered at (0, 0) relative to the container
		// So we need to offset by current width/height divided by 2
		const offsetX = currentWidth / 2;
		const offsetY = currentHeight / 2;

		// Convert to image pixel coordinates relative to current crop
		const relativeX = Math.max(0, Math.min(currentWidth, Math.round(topLeft.x + offsetX)));
		const relativeY = Math.max(0, Math.min(currentHeight, Math.round(topLeft.y + offsetY)));
		const relativeWidth = Math.max(1, Math.min(currentWidth - relativeX, Math.round(bottomRight.x - topLeft.x)));
		const relativeHeight = Math.max(1, Math.min(currentHeight - relativeY, Math.round(bottomRight.y - topLeft.y)));

		// If this is a successive crop, add to existing crop coordinates
		const cropData = {
			x: existingCropX + relativeX,
			y: existingCropY + relativeY,
			width: relativeWidth,
			height: relativeHeight,
			rotation: rotationAngle,
			scaleX: scaleValue / 100,
			scaleY: scaleValue / 100,
			isCircular: cropShape === 'circular'
		};

		// Cleanup UI elements AFTER getting crop data
		cleanupCropTool();
		cleanupRotationGrid();

		onApply(cropData);
	}

	export function cancel() {
		onCancel();
	}
</script>

<!-- No UI - this component only handles Konva canvas logic -->
