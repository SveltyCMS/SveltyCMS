<!--
@file: src/routes/(app)/imageEditor/widgets/Blur/Tool.svelte
@component
Controller for Blur tool: binds stage, manages BlurRegion instances,
handles drawing, applies/bakes effects, and registers toolbar.
-->
<script lang="ts">
	import Konva from 'konva';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import Controls from './Controls.svelte';
	import { BlurRegion, type RegionInit, type BlurPattern, type BlurShape } from './regions';

	// reactive tool state (Svelte 5 runes)
	let blurStrength = $state(20);
	let pattern = $state<BlurPattern>('blur');
	let shape = $state<BlurShape>('rectangle');
	let regions = $state<BlurRegion[]>([]);
	let drawing = $state(false);
	let startPoint = $state<{ x: number; y: number } | null>(null);
	let activeId = $state<string | null>(null);

	// guard to avoid duplicate event bindings
	let _toolBound = $state(false);

	// debounce timer for strength slider updates
	let strengthDebounceTimer: number | null = null;

	// Svelte 5: prefer callback props via $props instead of event dispatcher
	const props = $props<{ onBlurReset?: () => void; onBlurApplied?: () => void }>();

	// bind/unbind the tool when active state changes
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'blur') {
			bindStageEvents();
			imageEditorStore.setToolbarControls({
				component: Controls,
				props: {
					get blurStrength() {
						return blurStrength;
					},
					get pattern() {
						return pattern;
					},
					get shape() {
						return shape;
					},
					onStrengthChange: (v: number) => {
						blurStrength = v;
						if (strengthDebounceTimer) clearTimeout(strengthDebounceTimer);
						strengthDebounceTimer = window.setTimeout(() => {
							regions.forEach((r) => r.setStrength(v));
							imageEditorStore.state.layer?.batchDraw();
						}, 60);
					},
					onPatternChange: (p: BlurPattern) => {
						pattern = p;
						regions.forEach((r) => r.setPattern(p));
					},
					onShapeChange: (s: BlurShape) => (shape = s),
					onAddRegion: () => createRegion(),
					onReset: () => reset(),
					onApply: () => apply()
				}
			});
		} else {
			unbindStageEvents();
			// only clear toolbar if ours
			if (imageEditorStore.state.toolbarControls?.component === Controls) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	// add stage event listeners once
	function bindStageEvents() {
		const { stage } = imageEditorStore.state;
		if (!stage || _toolBound) return;
		stage.on('mousedown touchstart', handleMouseDown);
		stage.on('mousemove touchmove', handleMouseMove);
		stage.on('mouseup touchend', handleMouseUp);
		stage.on('click tap', handleStageClick);
		if (stage.container()) stage.container().style.cursor = 'crosshair';
		_toolBound = true;
	}

	// remove stage event listeners once
	function unbindStageEvents() {
		const { stage } = imageEditorStore.state;
		if (!stage || !_toolBound) return;
		stage.off('mousedown touchstart', handleMouseDown);
		stage.off('mousemove touchmove', handleMouseMove);
		stage.off('mouseup touchend', handleMouseUp);
		stage.off('click tap', handleStageClick);
		if (stage.container()) stage.container().style.cursor = 'default';
		_toolBound = false;
	}

	// deselect all regions when clicking outside overlays
	function handleStageClick(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
		const { stage, imageNode, imageGroup } = imageEditorStore.state;
		const t = e.target;
		if (!stage) return;
		// Deselect when clicking on bare stage, base image, or its group
		if (t === stage || t === imageNode || t === imageGroup) {
			deselectAllRegions();
		}
	}

	// begin drawing a new region when pointer is on stage or base image
	function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
		const { stage, imageNode, imageGroup } = imageEditorStore.state;
		const t = e.target;
		if (!stage) return;
		// Allow drawing when clicking on stage, the base image, or its group
		const allowed = t === stage || t === imageNode || t === imageGroup;
		if (!allowed) return;
		deselectAllRegions();
		drawing = true;
		const pos = stage.getPointerPosition();
		startPoint = pos ? { x: pos.x, y: pos.y } : null;
		if (startPoint) createRegion({ x: startPoint.x, y: startPoint.y, width: 4, height: 4, shape });
	}

	// update the active region shape during pointer move (fast, no cache)
	function handleMouseMove() {
		if (!drawing || !startPoint || !activeId) return;
		const pos = imageEditorStore.state.stage?.getPointerPosition();
		if (!pos) return;
		const r = regions.find((x) => x.id === activeId);
		if (!r) return;
		r.resizeFromStart(startPoint, pos);
		imageEditorStore.state.layer?.batchDraw();
	}

	// finish drawing: finalize shape and apply cached filter once
	function handleMouseUp() {
		if (!drawing) return;
		drawing = false;
		startPoint = null;
		const r = regions.find((x) => x.id === activeId);
		if (!r) return;
		if (r.isTooSmall()) {
			deleteRegion(r.id);
			return;
		}
		r.finalize();
		r.setPattern(pattern);
		r.setStrength(blurStrength);
		imageEditorStore.state.layer?.batchDraw();
	}

	// create a new region and wire lifecycle hooks
	function createRegion(init?: Partial<RegionInit>) {
		const { stage, layer, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !layer || !imageNode || !imageGroup) return;

		const newR = new BlurRegion({
			id: crypto.randomUUID(),
			layer,
			imageNode,
			imageGroup,
			init: { shape, pattern, strength: blurStrength, ...init }
		});

		regions = [...regions, newR];
		activeId = newR.id;

		newR.onSelect(() => selectRegion(newR.id));
		newR.onDestroy(() => {
			regions = regions.filter((x) => x.id !== newR.id);
			if (activeId === newR.id) activeId = null;
		});

		if (!drawing) {
			newR.setPattern(pattern);
			newR.setStrength(blurStrength);
			newR.finalize();
		}
	}

	// make specified region active and hide others
	function selectRegion(id: string) {
		activeId = id;
		regions.forEach((r) => r.setActive(r.id === id));
		imageEditorStore.state.layer?.batchDraw();
	}

	// deselect all regions
	function deselectAllRegions() {
		activeId = null;
		regions.forEach((r) => r.setActive(false));
		imageEditorStore.state.layer?.batchDraw();
	}

	// delete a region instance
	function deleteRegion(id: string) {
		const r = regions.find((x) => x.id === id);
		r?.destroy();
	}

	// hide or destroy all regions (used before bake and during reset)
	function cleanupBlurElements(destroyRegions = true) {
		if (destroyRegions) {
			[...regions].forEach((region) => region.destroy());
			regions = [];
		} else {
			regions.forEach((region) => region.hideUI());
		}
		activeId = null;
		drawing = false;
		startPoint = null;
		imageEditorStore.state.layer?.batchDraw();
	}

	// reset tool state and remove regions
	export function reset() {
		cleanupBlurElements(true);
		props.onBlurReset?.();
	}

	// cleanup invoked by parent store
	export function cleanup() {
		cleanupBlurElements(true);
		unbindStageEvents();
		if (strengthDebounceTimer) clearTimeout(strengthDebounceTimer);
	}

	export function saveState() {
		/* state captured by parent snapshots */
	}

	export function beforeExit() {
		cleanup();
	}

	// apply: bake overlays into a single image using an offscreen stage (safe)
	async function apply() {
		const { stage, layer, imageNode, imageGroup } = imageEditorStore.state;
		if (!stage || !layer || !imageNode || !imageGroup) return;

		// hide UI elements for a clean bake
		cleanupBlurElements(false);

		// Create offscreen stage sized to the image's pixel dimensions
		// We can't use a new Stage as it creates async canvas,
		// but we can use an off-screen Layer.
		// Let's use the safer full-stage-bake from the previous refactor
		// which is proven to work with all transforms.
		const dataURL = stage.toDataURL({ pixelRatio: 1 });

		// load baked image and swap into main imageNode
		const newImage = new Image();
		await new Promise<void>((res) => {
			newImage.onload = () => res();
			newImage.src = dataURL;
		});

		imageNode.image(newImage);
		imageNode.width(newImage.width);
		imageNode.height(newImage.height);
		imageNode.cropX(0);
		imageNode.cropY(0);
		imageNode.cropWidth(newImage.width);
		imageNode.cropHeight(newImage.height);
		// Re-center the image node in the imageGroup (1:1)
		imageNode.x(-newImage.width / 2);
		imageNode.y(-newImage.height / 2);
		imageNode.filters([]);
		imageNode.cache(); // Re-cache new base image

		// Reset group transforms (we baked them)
		imageGroup.scale({ x: 1, y: 1 });
		imageGroup.rotation(0);

		// cleanup temp stage and our UI
		cleanupBlurElements(true);

		// ** THE 1-LINE FIX **
		// Re-center the 1:1 group in the stage
		centerImageInStage();

		// finalize
		layer.batchDraw();
		props.onBlurApplied?.();
		imageEditorStore.setActiveState('');
	}

	// center image group in stage (used after apply)
	function centerImageInStage() {
		const { stage, imageGroup } = imageEditorStore.state;
		if (!stage || !imageGroup) return;
		imageGroup.position({ x: stage.width() / 2, y: stage.height() / 2 });
		stage.batchDraw();
	}
</script>

<!-- Controls registered to master toolbar; no DOM toolbar here -->
