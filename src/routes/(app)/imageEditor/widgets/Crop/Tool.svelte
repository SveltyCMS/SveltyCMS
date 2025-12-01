<!--
@file: src/routes/(app)/imageEditor/widgets/Crop/Tool.svelte
@component
**Crop Tool "Controller"**

Orchestrates the CropRegion, handles rotations/flips,
and implements the correct 'apply' logic by setting the
imageNode's 'crop' properties.
-->
<script lang="ts">
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import CropControls from './Controls.svelte';
	import CropRegion, { type CropShape } from './regions';
	import { stageRectToImageRect } from './cropMath';

	let cropShape = $state('rectangle');
	let aspectRatio = $state('free');

	// This is the *only* region. We don't use an array for crop.
	let region = $state(null);

	// guard to avoid duplicate event bindings
	let _toolBound = $state(false);

	// Svelte 5: prefer callback props
	const props = $props();

	// bind/unbind the tool when active state changes
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'crop') {
			bindTool();
			imageEditorStore.setToolbarControls({
				component: CropControls,
				props: {
					get cropShape() {
						return cropShape;
					},
					get aspectRatio() {
						return aspectRatio;
					},
					onRotateLeft: rotateLeft,
					onFlipHorizontal: flipHorizontal,
					onCropShapeChange: (s: string) => {
						cropShape = s as CropShape;
						// If shape changes, force aspect
						if (s === 'square' || s === 'circular') {
							aspectRatio = '1:1';
						}
						initDefaultRegion();
					},
					onAspectRatioChange: (r: string) => {
						aspectRatio = r;
						// If aspect changes, force shape
						if (r === '1:1') {
							// default to square for 1:1
							cropShape = cropShape === 'circular' ? 'circular' : 'square';
						} else {
							cropShape = 'rectangle';
						}
						initDefaultRegion();
					},
					onApply: apply
				}
			});
		} else {
			unbindTool();
			if (imageEditorStore.state.toolbarControls?.component === CropControls) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	// add stage event listeners once
	function bindTool() {
		if (_toolBound) return;
		_toolBound = true;
		// Initialize the crop region when tool is activated
		initDefaultRegion();
	}

	// remove stage event listeners once
	function unbindTool() {
		if (!_toolBound) return;
		_toolBound = false;
		cleanup(); // Destroy region when tool is deactivated
	}

	// create a new region and wire lifecycle hooks
	function initDefaultRegion() {
		const { stage, layer, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !layer || !imageNode || !imageGroup) return;

		// Clean up old region first
		if (region) {
			region.destroy();
			region = null;
		}

		const newRegion = new CropRegion({
			id: crypto.randomUUID(),
			layer,
			imageNode,
			imageGroup,
			init: { shape: cropShape, aspect: aspectRatio }
		});

		// Wire event to update cutout on drag/transform
		// ** FIX 1: This is the 'desync' fix **
		newRegion.onTransform(() => {
			newRegion.updateCutout(false); // fast update, no cache
		});
		newRegion.onTransformEnd(() => {
			newRegion.updateCutout(true); // slow update, with cache
		});

		newRegion.attachTransformer();
		region = newRegion;
		layer.batchDraw();
	}

	function rotateLeft() {
		const { imageGroup, layer } = imageEditorStore.state;
		if (!imageGroup || !layer) return;

		// Get current rotation and add -90
		const currentRotation = imageGroup.rotation();
		const newRotation = (currentRotation - 90) % 360;
		imageGroup.rotation(newRotation);

		// We must also re-center the crop region
		if (region) {
			region.centerIn(imageGroup.getClientRect());
			region.updateCutout(true);
		}
		layer.batchDraw();
	}

	function flipHorizontal() {
		const { imageGroup, layer } = imageEditorStore.state;
		if (!imageGroup || !layer) return;

		imageGroup.scaleX(imageGroup.scaleX() * -1);

		// We must also re-center the crop region
		if (region) {
			region.centerIn(imageGroup.getClientRect());
			region.updateCutout(true);
		}
		layer.batchDraw();
	}

	//
	// ** FIX 2: This is the correct 'apply' logic for Crop **
	//
	async function apply() {
		const { stage, layer, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !layer || !imageNode || !imageGroup || !region) return;

		// 1. Get the final crop box geometry from the shape
		const cropStageRect = region.shape.getClientRect();

		// 2. Convert stage-space rect to image-local pixel-space rect
		//    (Uses your helper function!)
		const cropPixelRect = stageRectToImageRect(cropStageRect, imageNode, imageGroup);

		// 3. Get the *current* visual rotation/scale of the image group
		const finalRotation = imageGroup.rotation();
		const finalScaleX = imageGroup.scaleX();
		const finalScaleY = imageGroup.scaleY();

		// 4. Clean up the crop UI
		cleanup();

		// 5. Apply the pixel crop to the *image node*
		imageNode.setAttrs({
			cropX: cropPixelRect.x,
			cropY: cropPixelRect.y,
			width: cropPixelRect.width,
			height: cropPixelRect.height
		} as any);

		// 6. Apply the visual transforms (rotation/scale) to the *image node*
		//    This "bakes" them in, relative to the *new* center
		const newCenter = { x: cropPixelRect.width / 2, y: cropPixelRect.height / 2 };
		imageNode.setAttrs({
			x: -newCenter.x,
			y: -newCenter.y,
			offsetX: 0,
			offsetY: 0,
			rotation: finalRotation,
			scaleX: finalScaleX,
			scaleY: finalScaleY
		} as any);

		// 7. Reset the *image group* (the container) to a 1:1 state
		//    It no longer needs to hold transforms, they're baked.
		imageGroup.setAttrs({
			x: 0,
			y: 0,
			rotation: 0,
			scaleX: 1,
			scaleY: 1
		});

		// 8. Re-center and re-scale the *image group* to fit the new
		//    cropped image in the viewport.
		const scale = Math.min((stage.width() * 0.8) / cropPixelRect.width, (stage.height() * 0.8) / cropPixelRect.height);
		imageGroup.setAttrs({
			x: stage.width() / 2,
			y: stage.height() / 2,
			scaleX: scale,
			scaleY: scale
		});

		// 9. Finalize
		layer.batchDraw();
		props.onCropApplied?.(); // Callback for snapshot
		imageEditorStore.setActiveState('');
	}

	// cleanup invoked by parent store
	export function cleanup() {
		if (region) {
			region.destroy();
			region = null;
		}
		imageEditorStore.state.layer?.batchDraw();
	}
	export function saveState() {
		/* state captured by parent snapshots */
	}
	export function beforeExit() {
		cleanup();
	}

	// --- Expose functions for Controls ---
	// These are now part of the props passed to setToolbarControls
</script>

<!-- Controls registered to master toolbar; no DOM toolbar here -->
