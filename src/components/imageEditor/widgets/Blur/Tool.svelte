<!--
@file: src/components/imageEditor/widgets/Blur/Tool.svelte
@component
Controller for Blur tool: binds stage, manages BlurRegion instances,
handles drawing, applies/bakes effects, and registers toolbar.
-->
<script lang="ts">
	import Konva from 'konva';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import Controls from '@src/components/imageEditor/toolbars/BlurControls.svelte';
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
	const DEBOUNCE_DELAY = 16; // ~60fps

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
					hasActiveRegion: !!activeId,
					regionCount: regions.length,
					onStrengthChange: (v: number) => {
						blurStrength = v;
						if (strengthDebounceTimer) clearTimeout(strengthDebounceTimer);
						strengthDebounceTimer = window.setTimeout(() => {
							// Update all regions or just active one?
							// UX decision: Global strength/pattern for simplicity,
							// OR per-region. Let's do per-region but if none active, update defaults.
							// Currently: Update active if exists, else generic setting.

							if (activeId) {
								regions.find((r) => r.id === activeId)?.setStrength(v);
							} else {
								// If we want "global" default, we'd update all?
								// Let's stick to updating ACTIVE region if selected.
							}
							imageEditorStore.state.layer?.batchDraw();
						}, DEBOUNCE_DELAY);
					},
					onPatternChange: (p: BlurPattern) => {
						pattern = p;
						if (activeId) {
							regions.find((r) => r.id === activeId)?.setPattern(p);
						}
					},
					onShapeChange: (s: BlurShape) => {
						shape = s;
						if (activeId) {
							const r = regions.find((x) => x.id === activeId);
							if (r) {
								// Re-create region with new shape
								const serialized = r.serialize();
								deleteRegion(r.id);
								createRegion({
									...serialized, // maintain pos/size
									shape: s
								});
							}
						}
					},
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
			if (imageEditorStore.state.toolbarControls?.component === Controls) {
				imageEditorStore.setToolbarControls(null);
			}
		}
	});

	// Keep properties in sync with UI when active selection changes
	$effect(() => {
		if (activeId) {
			const r = regions.find((x) => x.id === activeId);
			if (r) {
				const s = r.serialize();
				// Update local state to match active region
				// Use untracked to avoid cyclic dependency if needed,
				// but here we want UI to reflect selection.
				blurStrength = s.strength;
				pattern = s.pattern;
				shape = s.shape;
			}
		}
	});

	// Auto-initialize first region if empty
	$effect(() => {
		if (_toolBound && regions.length === 0) {
			createRegion();
		}
	});

	function bindStageEvents() {
		const { stage } = imageEditorStore.state;
		if (!stage || _toolBound) return;
		stage.on('click tap', handleStageClick);
		if (stage.container()) stage.container().style.cursor = 'crosshair';
		_toolBound = true;
	}

	function unbindStageEvents() {
		const { stage } = imageEditorStore.state;
		if (!stage || !_toolBound) return;
		stage.off('click tap', handleStageClick);
		if (stage.container()) stage.container().style.cursor = 'default';
		_toolBound = false;
	}

	function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
		const { stage, imageNode, imageGroup } = imageEditorStore.state;
		const t = e.target;
		if (!stage) return;
		// If clicking on background (stage/image), usually deselect or create new.
		// For Blur tool, user often wants to click to add.
		if (t === stage || t === imageNode || t === imageGroup) {
			// Deselect first
			activeId = null;
			regions.forEach((r) => r.setActive(false));
		}
	}

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
			const s = newR.serialize();
			createRegion({
				...s,
				x: s.x + 20,
				y: s.y + 20
			});
		});
		newR.onDestroy(() => {
			regions = regions.filter((x) => x.id !== newR.id);
			if (activeId === newR.id) activeId = null;
		});

		newR.setPattern(pattern);
		newR.setStrength(blurStrength);
		newR.finalize();

		selectRegion(newR.id);
	}

	function selectRegion(id: string) {
		activeId = id;
		regions.forEach((r) => r.setActive(r.id === id));
		imageEditorStore.state.layer?.batchDraw();
	}

	function deleteRegion(id: string) {
		const r = regions.find((x) => x.id === id);
		r?.destroy();
	}

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

	export function reset() {
		cleanupBlurElements(true);
		// Optionally reset params
		blurStrength = 20;
		pattern = 'blur';
		shape = 'rectangle';
		createRegion();
	}

	export function apply() {
		cleanupBlurElements(false);
		imageEditorStore.takeSnapshot();
		imageEditorStore.setActiveState('');
	}

	export function cleanup() {
		try {
			unbindStageEvents();
			cleanupBlurElements(false);
		} catch (e) {
			/* ignore */
		}
	}

	export function saveState() {
		/* handled by snapshot */
	}

	export function beforeExit() {
		cleanup();
	}
</script>
