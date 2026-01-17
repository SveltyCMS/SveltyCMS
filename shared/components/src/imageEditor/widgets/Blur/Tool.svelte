<!--
@file shared/components/src/imageEditor/widgets/Blur/Tool.svelte
@component
Controller for Blur tool: binds stage, manages BlurRegion instances,
handles drawing, applies/bakes effects, and registers toolbar.
-->
<script lang="ts">
	import Konva from 'konva';
	import { imageEditorStore } from '@shared/stores/imageEditorStore.svelte';
	import Controls from './Controls.svelte';
	import { BlurRegion, type RegionInit, type BlurPattern, type BlurShape } from './regions';

	// reactive tool state (Svelte 5 runes)
	let blurStrength = $state(20);
	let pattern = $state<BlurPattern>('blur');
	let shape = $state<BlurShape>('rectangle');
	let regions = $state<BlurRegion[]>([]);
	let activeId = $state<string | null>(null);

	// guard to avoid duplicate event bindings
	let _toolBound = $state(false);

	let { onCancel }: { onCancel: () => void } = $props();

	// debounce timer for strength slider updates
	let strengthDebounceTimer: number | null = null;

	// bind/unbind the tool when active state changes
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		if (activeState === 'blur') {
			bindStageEvents();
			imageEditorStore.setToolbarControls({
				component: Controls,
				props: {
					blurStrength,
					pattern,
					shape,
					onAdd: undefined, // Remove duplicates
					onDelete: undefined, // Remove duplicates
					onStrengthChange: (v: number) => {
						blurStrength = v;
						if (strengthDebounceTimer) clearTimeout(strengthDebounceTimer);
						strengthDebounceTimer = window.setTimeout(() => {
							// ALWAYS update activeId if exists, or all regions
							if (activeId) {
								regions.find((r) => r.id === activeId)?.setStrength(v);
							} else {
								regions.forEach((r) => r.setStrength(v));
							}
							imageEditorStore.state.layer?.batchDraw();
						}, 30); // Fast feedback
					},
					onPatternChange: (p: BlurPattern) => {
						pattern = p;
						regions.forEach((r) => r.setPattern(p));
					},
					onShapeChange: (s: BlurShape) => {
						shape = s;
						// If there's an active region, change its shape
						if (activeId) {
							const r = regions.find((x) => x.id === activeId);
							if (r) {
								// Remove old region and create new one with same position but new shape
								const oldShape = r.shapeNode;
								const bounds = oldShape.getClientRect();
								deleteRegion(r.id);
								createRegion({
									x: bounds.x,
									y: bounds.y,
									width: bounds.width,
									height: bounds.height,
									shape: s
								});
							}
						}
					},
					// NEW: Add, Delete, Rotate, Flip handlers
					onAddRegion: () => {
						const stage = imageEditorStore.state.stage;
						const x = stage ? stage.width() / 2 : 100;
						const y = stage ? stage.height() / 2 : 100;
						createRegion({ x, y });
					},
					onDeleteRegion: () => {
						if (activeId) deleteRegion(activeId);
					},
					onRotateLeft: () => {
						if (activeId) regions.find((x) => x.id === activeId)?.rotate(-90);
					},
					onRotateRight: () => {
						if (activeId) regions.find((x) => x.id === activeId)?.rotate(90);
					},
					onFlipHorizontal: () => {
						if (activeId) regions.find((x) => x.id === activeId)?.flipX();
					},
					onReset: () => reset(),
					onCancel: () => onCancel(),
					onApply: apply
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

	// Auto-initialize first region if empty
	$effect(() => {
		if (_toolBound && regions.length === 0) {
			createRegion();
		}
	});

	// add stage event listeners once
	function bindStageEvents() {
		const { stage } = imageEditorStore.state;
		if (!stage || _toolBound) return;
		stage.on('click tap', handleStageClick);
		if (stage.container()) stage.container().style.cursor = 'crosshair';
		_toolBound = true;
	}

	// remove stage event listeners once
	function unbindStageEvents() {
		const { stage } = imageEditorStore.state;
		if (!stage || !_toolBound) return;
		stage.off('click tap', handleStageClick);
		if (stage.container()) stage.container().style.cursor = 'default';
		_toolBound = false;
	}

	// deselect all regions when clicking outside overlays
	function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
		const { stage, imageNode, imageGroup } = imageEditorStore.state;
		const t = e.target;
		if (!stage) return;
		// If clicking on stage, base image, or its group - create a new region
		if (t === stage || t === imageNode || t === imageGroup) {
			const pos = stage.getPointerPosition();
			if (pos) {
				// Create a new region at click position with default size
				createRegion({
					x: pos.x - 100,
					y: pos.y - 75,
					width: 200,
					height: 150,
					shape
				});
			}
		}
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
		newR.onClone(() => {
			const bounds = newR.shapeNode.getClientRect();
			createRegion({
				x: bounds.x + 20,
				y: bounds.y + 20,
				width: bounds.width,
				height: bounds.height,
				shape: newR.shapeNode instanceof Konva.Ellipse ? 'ellipse' : 'rectangle',
				pattern: pattern,
				strength: blurStrength
			});
		});
		newR.onDestroy(() => {
			regions = regions.filter((x) => x.id !== newR.id);
			if (activeId === newR.id) activeId = null;
		});

		// Always finalize and apply effects for click-created regions
		newR.setPattern(pattern);
		newR.setStrength(blurStrength);
		newR.finalize();

		// Make the new region active to show handles
		selectRegion(newR.id);
	}

	// make specified region active and hide others
	function selectRegion(id: string) {
		activeId = id;
		regions.forEach((r) => r.setActive(r.id === id));
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
		imageEditorStore.state.layer?.batchDraw();
	}

	// reset tool state and remove regions
	export function reset() {
		cleanupBlurElements(true);
	}

	// Apply blur: bake all blur regions into the image
	export function apply() {
		// Hide UI elements before baking
		cleanupBlurElements(false);

		// Take snapshot with blur regions visible
		imageEditorStore.takeSnapshot();

		// Clean up and exit
		imageEditorStore.setActiveState('');
	}

	// cleanup invoked by parent store
	export function cleanup() {
		try {
			unbindStageEvents();
			cleanupBlurElements(true);
		} catch (e) {
			/* ignore */
		}
	}

	export function saveState() {
		/* state captured by parent snapshots */
	}

	export function beforeExit() {
		cleanup();
	}
</script>

<!-- Controls registered to master toolbar; no DOM toolbar here -->
