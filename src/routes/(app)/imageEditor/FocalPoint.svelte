<!-- 
@file src/routes/(app)/imageEditor/components/FocalPoint.svelte
@component
**This component allows users to set or reset a focal point on the image with rule of thirds grid**

### Props 
- `stage`: Konva.Stage - The Konva stage where the image is displayed.
- `layer`: Konva.Layer - The Konva layer where the image and effects are added.
- `imageNode`: Konva.Image - The Konva image node representing the original image.
- `onFocalpoint`: (data: { x: number; y: number }) => void - Callback when focal point changes
-->

<script lang="ts">
	import Konva from 'konva';

	interface Props {
		stage: Konva.Stage;
		layer: Konva.Layer;
		imageNode: Konva.Image;
		onFocalpoint?: (data: { x: number; y: number }) => void;
	}

	const { stage, layer, imageNode, onFocalpoint = () => {} } = $props() as Props;

	let focalPoint: Konva.Group | null = $state(null);
	let ruleOfThirdsGrid: Konva.Group | null = $state(null);
	let focalPointActive = $state(false);
	let relativeX: number = $state(0);
	let relativeY: number = $state(0);

	// Initialize focal point and event listeners
	$effect.root(() => {
		createRuleOfThirdsGrid();
		createFocalPoint(); // Create focal point at the center of the image
		setupEventListeners();

		// Cleanup function
		return () => {
			if (focalPoint) {
				focalPoint.destroy();
			}
			if (ruleOfThirdsGrid) {
				ruleOfThirdsGrid.destroy();
			}
			stage.off('click');
		};
	});

	function createRuleOfThirdsGrid() {
		// Clean up existing grid
		if (ruleOfThirdsGrid) {
			ruleOfThirdsGrid.destroy();
		}

		const imageGroup = imageNode.getParent() as Konva.Group;
		if (!imageGroup) return;

		const imageRect = imageNode.getClientRect();

		ruleOfThirdsGrid = new Konva.Group({
			name: 'focalPointTool',
			listening: false // Grid should not be interactive
		});

		// Create vertical lines (at 1/3 and 2/3)
		for (let i = 1; i <= 2; i++) {
			const x = imageRect.x + (imageRect.width * i) / 3;
			const line = new Konva.Line({
				points: [x, imageRect.y, x, imageRect.y + imageRect.height],
				stroke: 'rgba(255, 255, 255, 0.5)',
				strokeWidth: 1,
				dash: [5, 5],
				listening: false
			});
			ruleOfThirdsGrid.add(line);
		}

		// Create horizontal lines (at 1/3 and 2/3)
		for (let i = 1; i <= 2; i++) {
			const y = imageRect.y + (imageRect.height * i) / 3;
			const line = new Konva.Line({
				points: [imageRect.x, y, imageRect.x + imageRect.width, y],
				stroke: 'rgba(255, 255, 255, 0.5)',
				strokeWidth: 1,
				dash: [5, 5],
				listening: false
			});
			ruleOfThirdsGrid.add(line);
		}

		// Add intersection points at grid intersections
		for (let i = 1; i <= 2; i++) {
			for (let j = 1; j <= 2; j++) {
				const x = imageRect.x + (imageRect.width * i) / 3;
				const y = imageRect.y + (imageRect.height * j) / 3;
				const point = new Konva.Circle({
					x,
					y,
					radius: 3,
					fill: 'rgba(255, 255, 255, 0.6)',
					listening: false
				});
				ruleOfThirdsGrid.add(point);
			}
		}

		layer.add(ruleOfThirdsGrid);
		ruleOfThirdsGrid.moveToBottom(); // Place grid below focal point
		layer.draw();
	}

	function createFocalPoint() {
		// Ensure only one focal point exists by destroying the previous one if it exists
		if (focalPoint) {
			focalPoint.destroy();
		}

		// Create focal point in the center of the image
		const imageCenterX = stage.width() / 2;
		const imageCenterY = stage.height() / 2;

		focalPoint = new Konva.Group({
			name: 'focalPointTool',
			x: imageCenterX,
			y: imageCenterY,
			draggable: true
		});

		const outerCircle = new Konva.Circle({
			radius: 20,
			stroke: 'white',
			strokeWidth: 2,
			dash: [5, 5]
		});

		const innerCircle = new Konva.Circle({
			radius: 5,
			fill: 'red'
		});

		const crosshairVertical = new Konva.Line({
			points: [0, -15, 0, 15],
			stroke: 'white',
			strokeWidth: 2
		});

		const crosshairHorizontal = new Konva.Line({
			points: [-15, 0, 15, 0],
			stroke: 'white',
			strokeWidth: 2
		});

		focalPoint.add(outerCircle, innerCircle, crosshairVertical, crosshairHorizontal);
		layer.add(focalPoint);
		layer.draw();

		// Update focal point coordinates to (0, 0) at the center
		updateFocalPoint();
		focalPointActive = true;
	}

	function setupEventListeners() {
		stage.on('click', (e) => {
			if (e.target === stage || e.target === imageNode) {
				if (!focalPointActive || !focalPoint) {
					return;
				}
				const position = stage.getPointerPosition();
				if (position && focalPoint) {
					focalPoint.position({
						x: position.x,
						y: position.y
					});
					updateFocalPoint();
				}
			}
		});

		focalPoint?.on('dragmove', () => {
			updateFocalPoint();
		});

		focalPoint?.on('mouseenter', () => {
			document.body.style.cursor = 'move';
		});

		focalPoint?.on('mouseleave', () => {
			document.body.style.cursor = 'default';
		});
	}

	function updateFocalPoint() {
		if (!focalPoint) return;

		const imageRect = imageNode.getClientRect();
		const focalPointPos = focalPoint.position();

		// Calculate the relative position where (0,0) is the center of the image
		relativeX = (focalPointPos.x - imageRect.x) / imageRect.width - 0.5;
		relativeY = (focalPointPos.y - imageRect.y) / imageRect.height - 0.5;

		// Trigger reactivity manually
		relativeX = Number(relativeX.toFixed(2));
		relativeY = Number(relativeY.toFixed(2));

		onFocalpoint({ x: relativeX, y: relativeY });
		layer.draw();
	}

	export function reset() {
		// Reset focal point to the center of the image
		if (!focalPoint) {
			createFocalPoint();
		} else {
			const imageCenterX = stage.width() / 2;
			const imageCenterY = stage.height() / 2;
			focalPoint.position({ x: imageCenterX, y: imageCenterY });
			updateFocalPoint();
		}
		layer.draw();
	}

	export function remove() {
		// Remove the focal point
		if (focalPoint) {
			focalPoint.destroy();
			focalPoint = null;
			focalPointActive = false;
			relativeX = 0;
			relativeY = 0;
			onFocalpoint({ x: 0, y: 0 });
		}
		layer.draw();
	}

	export function apply() {
		// Return the current focal point data
		return { x: relativeX, y: relativeY };
	}

	export function cleanup() {
		if (focalPoint) {
			focalPoint.destroy();
			focalPoint = null;
		}
		if (ruleOfThirdsGrid) {
			ruleOfThirdsGrid.destroy();
			ruleOfThirdsGrid = null;
		}
		stage.off('click');
	}

	// Expose the current focal point coordinates
	export { relativeX as focalPointX, relativeY as focalPointY };
</script>

<!-- No UI - this component only handles Konva canvas logic -->
