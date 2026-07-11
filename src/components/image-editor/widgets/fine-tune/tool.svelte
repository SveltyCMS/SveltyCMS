<!--
@file src/components/image-editor/widgets/fine-tune/tool.svelte
@component
**Fine-Tune "Controller" Component**

Orchestrates the filter modules using svelte-canvas compatible state.
-->
<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import {
		type Adjustments,
		DEFAULT_ADJUSTMENTS,
		FILTER_PRESETS,
		getAdjustmentConfig,
		getAdjustmentsByCategory
	} from './adjustments';
	import FineTuneControls from './controls.svelte';
	import FineTuneControlsMobile from './controls-mobile.svelte';

	let activeAdjustment = $state<keyof Adjustments>('brightness');
	let activeCategory = $state('basic');
	let isComparing = $state(false);

	const storeState = imageEditorStore.state;

	$effect(() => {
		if (imageEditorStore.state.activeState === 'finetune') {
			// Snapshot via $state.snapshot to avoid mutating the reactive proxy inside the effect
			const currentFilters = $state.snapshot(storeState.filters) as Record<string, number>;
			let needsUpdate = false;
			for (const [key, defaultValue] of Object.entries(DEFAULT_ADJUSTMENTS)) {
				if (currentFilters[key] === undefined) {
					currentFilters[key] = defaultValue as number;
					needsUpdate = true;
				}
			}
			if (needsUpdate) {
				storeState.filters = currentFilters as typeof storeState.filters;
			}
		}
	});

	$effect(() => {
		const activeState = imageEditorStore.state.activeState;
		const viewportWidth = imageEditorStore.state.viewportWidth;
		const isMobile = viewportWidth < imageEditorStore.mobileBreakpoint;
		const adjustment = activeAdjustment;
		const filters = storeState.filters;

		if (activeState === 'finetune') {
			updateToolbar(isMobile, adjustment, filters as unknown as Adjustments);
		} else if (!activeState && isFinetuneToolbarComponent(imageEditorStore.state.toolbarControls?.component)) {
			imageEditorStore.setToolbarControls(null);
			imageEditorStore.compareSliderPosition = 0;
		}
	});

	function isFinetuneToolbarComponent(component: unknown): boolean {
		return component === FineTuneControls || component === FineTuneControlsMobile;
	}

	function updateToolbar(
		isMobile: boolean,
		adjustment: keyof Adjustments,
		filters: Adjustments
	) {
		if (imageEditorStore.state.activeState !== 'finetune') {
			return;
		}

		const currentValue = filters[adjustment];
		const ControlsComponent = isMobile ? FineTuneControlsMobile : FineTuneControls;

		const coreHandlers = {
			activeAdjustment: adjustment,
			value: currentValue ?? 0,
			adjustments: filters,
			onChange: (val: number) => {
				storeState.filters = {
					...storeState.filters,
					[activeAdjustment]: val
				};
			},
			onAdjustmentChange: (key: keyof Adjustments) => {
				activeAdjustment = key;
			}
		};

		imageEditorStore.setToolbarControls({
			component: ControlsComponent,
			props: isMobile
				? coreHandlers
				: {
						...coreHandlers,
						activeCategory,
						showPresets: true,
						isComparing,
						onCategoryChange: (cat: string) => {
							activeCategory = cat;
							const adj = getAdjustmentsByCategory(cat as 'basic' | 'tone' | 'color' | 'detail')[0];
							if (adj) {
								activeAdjustment = adj.key;
							}
						},
						onPresetApply: (presetName: string) => {
							const preset = FILTER_PRESETS.find((p) => p.name === presetName);
							if (preset) {
								imageEditorStore.takeSnapshot();
								imageEditorStore.compareSliderPosition = 0;
								storeState.filters = {
									...DEFAULT_ADJUSTMENTS,
									...preset.adjustments
								};
								const firstChangedKey =
									(Object.keys(preset.adjustments)[0] as keyof Adjustments | undefined) ?? 'brightness';
								activeAdjustment = firstChangedKey;
								const presetConfig = getAdjustmentConfig(firstChangedKey);
								if (presetConfig) {
									activeCategory = presetConfig.category;
								}
							}
						},
						onReset: () => {
							storeState.filters = {
								...storeState.filters,
								[adjustment]: DEFAULT_ADJUSTMENTS[adjustment] ?? 0
							};
						},
						onResetAll: () => {
							storeState.filters = { ...DEFAULT_ADJUSTMENTS };
						},
						onCompareToggle: () => {
							isComparing = !isComparing;
							imageEditorStore.compareSliderPosition = isComparing ? 50 : 0;
						},
						onAutoAdjust: autoAdjust
					}
		});
	}

	function autoAdjust() {
		storeState.filters = {
			...DEFAULT_ADJUSTMENTS,
			contrast: 10,
			saturation: 20
		};
	}

	export function saveState() {}
	export function beforeExit() {}
</script>
