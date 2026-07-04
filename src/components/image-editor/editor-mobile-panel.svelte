<!--
@file src/components/image-editor/editor-mobile-panel.svelte
@component
Mobile bottom chrome — slider, mode pills, compact tool controls, icon rail.
-->
<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { getAdjustmentConfig } from './widgets/fine-tune/adjustments';
	import EditorMobileToolRail from './editor-mobile-tool-rail.svelte';

	type MobileAdjustMode = 'rotation' | 'scale';

	let {
		hasImage = false,
		onToolSelect
	}: {
		hasImage?: boolean;
		onToolSelect: (tool: string) => void;
	} = $props();

	const storeState = imageEditorStore.state;
	const activeTool = $derived(imageEditorStore.state.activeState);
	const toolbarControls = $derived(imageEditorStore.state.toolbarControls);
	/** Zoom-only slider here; crop/rotate use top quick actions + fine slider only when needed */
	const showTransformSlider = $derived(
		activeTool === 'crop' || activeTool === 'rotate' || activeTool === 'zoom'
	);
	const showRotationScalePills = $derived(activeTool === 'crop');
	const showCropControls = $derived(activeTool === 'crop' && !!toolbarControls?.component);
	const showFinetuneMobile = $derived(activeTool === 'finetune' && !!toolbarControls?.component);
	const showBlurMobile = $derived(activeTool === 'blur' && !!toolbarControls?.component);
	const showAnnotateMobile = $derived(activeTool === 'annotate' && !!toolbarControls?.component);
	const showWatermarkMobile = $derived(activeTool === 'watermark' && !!toolbarControls?.component);
	const showFocalMobile = $derived(activeTool === 'focalpoint' && !!toolbarControls?.component);
	const finetuneProps = $derived(showFinetuneMobile ? toolbarControls!.props : null);
	const blurProps = $derived(showBlurMobile ? toolbarControls!.props : null);
	const annotateProps = $derived(showAnnotateMobile ? toolbarControls!.props : null);
	const watermarkProps = $derived(showWatermarkMobile ? toolbarControls!.props : null);
	const focalProps = $derived(showFocalMobile ? toolbarControls!.props : null);
	const focalX = $derived(focalProps?.focalX ?? 50);
	const focalY = $derived(focalProps?.focalY ?? 50);
	const focalXProgress = $derived(Math.max(0, Math.min(1, focalX / 100)));
	const focalYProgress = $derived(Math.max(0, Math.min(1, focalY / 100)));
	const showAnnotateTextInput = $derived(
		showAnnotateMobile &&
			(annotateProps?.currentTool === 'text' ||
				(annotateProps?.hasSelection && annotateProps?.selectedType === 'text'))
	);
	const showWatermarkTextInput = $derived(
		showWatermarkMobile && watermarkProps?.selectedType === 'text' && !!watermarkProps?.onTextDraftChange
	);
	const showWatermarkOpacitySlider = $derived(
		showWatermarkMobile && watermarkProps?.hasSelection && !!watermarkProps?.onOpacityChange
	);
	const watermarkOpacity = $derived(Math.round((watermarkProps?.currentOpacity ?? 0.8) * 100));
	const watermarkOpacityProgress = $derived(Math.max(0, Math.min(1, watermarkProps?.currentOpacity ?? 0.8)));
	const blurStrength = $derived(blurProps?.blurStrength ?? 20);
	const blurSliderProgress = $derived(Math.max(0, Math.min(1, (blurStrength - 5) / 95)));
	const finetuneValue = $derived(finetuneProps?.value ?? 0);
	const finetuneActiveKey = $derived(finetuneProps?.activeAdjustment ?? 'brightness');
	const finetuneConfig = $derived(getAdjustmentConfig(finetuneActiveKey));
	const finetuneMin = $derived(finetuneConfig?.min ?? -100);
	const finetuneMax = $derived(finetuneConfig?.max ?? 100);
	const finetuneStep = $derived(finetuneConfig?.step ?? 1);
	const finetuneValueLabel = $derived(`${finetuneValue > 0 ? '+' : ''}${finetuneValue}`);
	const finetuneSliderProgress = $derived.by(() => {
		const span = finetuneMax - finetuneMin;
		if (span <= 0) return 0.5;
		return Math.max(0, Math.min(1, (finetuneValue - finetuneMin) / span));
	});
	let adjustMode = $state<MobileAdjustMode>('rotation');
	const useRotationSlider = $derived(
		activeTool === 'rotate' || (activeTool === 'crop' && adjustMode === 'rotation')
	);
	const showToolControls = $derived(
		!!toolbarControls?.component &&
			activeTool !== 'rotate' &&
			activeTool !== 'crop' &&
			activeTool !== 'zoom' &&
			activeTool !== 'finetune' &&
			activeTool !== 'blur' &&
			activeTool !== 'annotate' &&
			activeTool !== 'watermark' &&
			activeTool !== 'focalpoint'
	);

	const toolSheetLabel = $derived.by(() => {
		const labels: Record<string, string> = {
			crop: 'Crop',
			finetune: 'Adjust',
			blur: 'Blur',
			annotate: 'Annotate',
			watermark: 'Watermark',
			focalpoint: 'Focal point'
		};
		return labels[activeTool] ?? '';
	});

	const rotationDisplay = $derived(Math.round(storeState.rotation));
	const zoomPercent = $derived(Math.round(storeState.zoom * 100));

	/** 0–1 position along the dotted track (matches inset-inline: 0.75rem on dots) */
	const sliderProgress = $derived.by(() => {
		if (useRotationSlider) {
			return Math.max(0, Math.min(1, (storeState.rotation + 180) / 360));
		}
		return Math.max(0, Math.min(1, (zoomPercent - 10) / (500 - 10)));
	});

	$effect(() => {
		if (activeTool === 'zoom') {
			adjustMode = 'scale';
		} else if (activeTool === 'crop' || activeTool === 'rotate') {
			adjustMode = 'rotation';
		}
	});

	function handleRotationInput(e: Event) {
		storeState.rotation = Number.parseFloat((e.currentTarget as HTMLInputElement).value);
	}

	function handleRotationCommit() {
		imageEditorStore.takeSnapshot();
	}

	function handleZoomInput(e: Event) {
		const value = Number.parseInt((e.currentTarget as HTMLInputElement).value, 10);
		storeState.zoom = Math.max(0.1, Math.min(5, value / 100));
	}

	function handleZoomCommit() {
		imageEditorStore.takeSnapshot();
	}

	function handleFinetuneInput(e: Event) {
		const value = Number.parseInt((e.currentTarget as HTMLInputElement).value, 10);
		finetuneProps?.onChange?.(value);
	}

	function handleFinetuneCommit() {
		imageEditorStore.takeSnapshot();
	}

	function handleBlurInput(e: Event) {
		const value = Number.parseInt((e.currentTarget as HTMLInputElement).value, 10);
		blurProps?.onStrengthChange?.(value);
	}

	function handleBlurCommit() {
		imageEditorStore.takeSnapshot();
	}

	let annotateTextInputRef = $state<HTMLInputElement | null>(null);

	function handleAnnotateTextInput(e: Event) {
		const value = (e.currentTarget as HTMLInputElement).value;
		annotateProps?.onTextDraftChange?.(value);
	}

	function handleAnnotateTextCommit() {
		annotateProps?.onApplyText?.();
		annotateTextInputRef?.blur();
	}

	function handleAnnotateTextKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleAnnotateTextCommit();
		}
	}

	function handleWatermarkTextInput(e: Event) {
		const value = (e.currentTarget as HTMLInputElement).value;
		watermarkProps?.onTextDraftChange?.(value);
	}

	function handleWatermarkOpacityInput(e: Event) {
		const value = Number.parseFloat((e.currentTarget as HTMLInputElement).value);
		watermarkProps?.onOpacityChange?.(value);
	}

	function handleWatermarkOpacityCommit() {
		imageEditorStore.takeSnapshot();
	}

	function handleFocalXInput(e: Event) {
		const value = Number.parseInt((e.currentTarget as HTMLInputElement).value, 10);
		focalProps?.onPointChange?.({ x: value, y: focalY });
	}

	function handleFocalYInput(e: Event) {
		const value = Number.parseInt((e.currentTarget as HTMLInputElement).value, 10);
		focalProps?.onPointChange?.({ x: focalX, y: value });
	}

	function handleFocalCommit() {
		imageEditorStore.takeSnapshot();
	}
</script>

<div class="flex shrink-0 flex-col gap-0 w-full max-h-[min(36dvh,16.5rem)] min-h-0 z-30 bg-[--editor-chrome-bg]">
	<div class="flex-[0_1_auto] min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
		{#if showTransformSlider}
			<div class="flex flex-col gap-0 py-1 px-4 pb-px" class:gap-1={!useRotationSlider}>
				<div class="relative flex items-center h-7.5 px-1">
					<div class="editor-mobile-slider-dots absolute inset-x-3 top-[42%] h-1.5 pointer-events-none -translate-y-1/2" aria-hidden="true"></div>
					{#if useRotationSlider}
						<div class="absolute top-[42%] left-1/2 z-0 flex flex-col items-center pointer-events-none -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
							<div class="w-[1.5px] h-3.5 bg-[rgba(255,255,255,0.72)] rounded-[1px]"></div>
						</div>
					{/if}
					<div
						class="absolute top-[42%] z-2 w-3.5 h-3.5 pointer-events-none bg-white rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.35)] -translate-x-1/2 -translate-y-1/2"
						style="--slider-progress: {sliderProgress}; left: calc(0.75rem + (100% - 1.5rem) * var(--slider-progress, 0.5))"
						aria-hidden="true"
					></div>
					<input aria-label={useRotationSlider ? 'Rotation angle' : 'Scale'}
						type="range"
						class="editor-mobile-slider-input relative z-3 w-full h-7.5 m-0 appearance-none cursor-pointer bg-transparent rounded-full"
						min={useRotationSlider ? -180 : 10}
						max={useRotationSlider ? 180 : 500}
						step="1"
						value={useRotationSlider ? storeState.rotation : zoomPercent}
						oninput={useRotationSlider ? handleRotationInput : handleZoomInput}
						onchange={useRotationSlider ? handleRotationCommit : handleZoomCommit}
						aria-valuetext={useRotationSlider ? `${rotationDisplay} degrees` : `${zoomPercent} percent`}
					/>
				</div>
				{#if useRotationSlider}
					<div class="text-[11px] font-medium leading-none text-center text-[rgba(255,255,255,0.72)] tabular-nums">{rotationDisplay}°</div>
				{:else}
					<div class="text-[11px] font-medium leading-none text-center text-[rgba(255,255,255,0.72)] tabular-nums">{zoomPercent}%</div>
				{/if}
			</div>

			{#if showRotationScalePills}
				<div class="flex items-center justify-center px-3 pb-1.5" role="tablist" aria-label="Adjust mode">
					<div class="inline-flex items-center gap-0.5 p-0.75 bg-white/6 rounded-full">
						<button
							type="button"
							class="py-1.25 px-3.5 text-[13px] font-medium leading-[1.2] text-[rgba(255,255,255,0.88)] cursor-pointer bg-transparent border-none rounded-full transition-[background,color] duration-150 {adjustMode === 'rotation' ? 'bg-white/[0.14]' : ''}"
							class:text-white={adjustMode === 'rotation'}
							role="tab"
							aria-selected={adjustMode === 'rotation'}
							onclick={() => (adjustMode = 'rotation')}
						>
							Rotation
						</button>
						<button
							type="button"
							class="py-1.25 px-3.5 text-[13px] font-medium leading-[1.2] text-[rgba(255,255,255,0.88)] cursor-pointer bg-transparent border-none rounded-full transition-[background,color] duration-150 {adjustMode === 'scale' ? 'bg-white/[0.14]' : ''}"
							class:text-white={adjustMode === 'scale'}
							role="tab"
							aria-selected={adjustMode === 'scale'}
							onclick={() => (adjustMode = 'scale')}
						>
							Scale
						</button>
					</div>
				</div>
			{/if}
		{/if}

		{#if showFinetuneMobile}
			<div class="flex flex-col gap-0 py-1 px-4 pb-px">
				<div class="relative flex items-center h-7.5 px-1">
					<div class="editor-mobile-slider-dots absolute inset-x-3 top-[42%] h-1.5 pointer-events-none -translate-y-1/2" aria-hidden="true"></div>
					<div class="absolute top-[42%] left-1/2 z-0 flex flex-col items-center pointer-events-none -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
						<div class="w-[1.5px] h-3.5 bg-[rgba(255,255,255,0.72)] rounded-[1px]"></div>
					</div>
					<div
						class="absolute top-[42%] z-2 w-3.5 h-3.5 pointer-events-none bg-white rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.35)] -translate-x-1/2 -translate-y-1/2"
						style="--slider-progress: {finetuneSliderProgress}; left: calc(0.75rem + (100% - 1.5rem) * var(--slider-progress, 0.5))"
						aria-hidden="true"
					></div>
					<input aria-label={finetuneConfig?.label ?? 'Adjustment'}
						type="range"
						class="editor-mobile-slider-input relative z-3 w-full h-7.5 m-0 appearance-none cursor-pointer bg-transparent rounded-full"
						min={finetuneMin}
						max={finetuneMax}
						step={finetuneStep}
						value={finetuneValue}
						oninput={handleFinetuneInput}
						onchange={handleFinetuneCommit}
						aria-valuetext={finetuneValueLabel}
					/>
				</div>
				<div class="text-[11px] font-medium leading-none text-center text-[rgba(255,255,255,0.72)] tabular-nums">{finetuneValueLabel}</div>
			</div>

			<div class="w-full py-0.5 px-2.5 pb-1">
				{#key toolbarControls!.component}
					{const Component = toolbarControls!.component}
					<Component {...toolbarControls!.props} />
				{/key}
			</div>
		{/if}

		{#if showBlurMobile}
			<div class="flex flex-col gap-1 py-1 px-4 pb-px">
				<div class="relative flex items-center h-7.5 px-1">
					<div class="editor-mobile-slider-dots absolute inset-x-3 top-[42%] h-1.5 pointer-events-none -translate-y-1/2" aria-hidden="true"></div>
					<div
						class="absolute top-[42%] z-2 w-3.5 h-3.5 pointer-events-none bg-white rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.35)] -translate-x-1/2 -translate-y-1/2"
						style="--slider-progress: {blurSliderProgress}; left: calc(0.75rem + (100% - 1.5rem) * var(--slider-progress, 0.5))"
						aria-hidden="true"
					></div>
					<input aria-label="Blur strength"
						type="range"
						class="editor-mobile-slider-input relative z-3 w-full h-7.5 m-0 appearance-none cursor-pointer bg-transparent rounded-full"
						min="5"
						max="100"
						step="1"
						value={blurStrength}
						oninput={handleBlurInput}
						onchange={handleBlurCommit}
						aria-valuetext="{blurStrength} percent"
					/>
				</div>
				<div class="text-[11px] font-medium leading-none text-center text-[rgba(255,255,255,0.72)] tabular-nums">{blurStrength}</div>
			</div>

			<div class="w-full py-0.5 px-2.5 pb-1">
				{#key toolbarControls!.component}
					{const Component = toolbarControls!.component}
					<Component {...toolbarControls!.props} />
				{/key}
			</div>
		{/if}

		{#if showAnnotateMobile}
			{#if showAnnotateTextInput}
				<div class="flex items-center w-full min-w-0 max-w-full py-0.5 px-2.5 pb-1 box-border">
					<div class="flex flex-[1_1_auto] gap-1 items-center min-w-0 h-9 py-0.75 ps-3 pe-0.75 bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.1)] rounded-full focus-within:border-[rgba(255,255,255,0.22)] focus-within:shadow-[0_0_0_2px_rgba(255,255,255,0.08)]">
						<input aria-label="Annotation text"
							bind:this={annotateTextInputRef}
							id="annotate-mobile-text"
							class="flex-[1_1_auto] min-w-0 h-full p-0 text-[13px] text-[rgba(255,255,255,0.92)] bg-transparent border-none outline-none placeholder:text-[rgba(255,255,255,0.38)] focus-visible:outline-none"
							type="text"
							value={annotateProps?.textDraft ?? 'Text'}
							placeholder="Enter text"
							oninput={handleAnnotateTextInput}
							onkeydown={handleAnnotateTextKeydown}
						/>
						<button
							type="button"
							class="inline-flex flex-[0_0_auto] items-center justify-center w-7 h-7 p-0 text-[#0a0a0a] cursor-pointer bg-[--editor-accent] border-none rounded-full transition-[background,transform] duration-150 active:scale-[0.94] active:bg-[--editor-accent-hover]"
							onclick={handleAnnotateTextCommit}
							aria-label={annotateProps?.hasSelection && annotateProps?.selectedType === 'text'
								? 'Done editing text'
								: 'Place text on image'}
						>
							<iconify-icon icon="mdi:check-bold" width="16" aria-hidden="true"></iconify-icon>
						</button>
					</div>
				</div>
			{/if}

			<div class="flex justify-center w-full min-w-0 max-w-full py-0.5 px-2.5 pb-1 box-border">
				{#key toolbarControls!.component}
					{const Component = toolbarControls!.component}
					<Component {...toolbarControls!.props} />
				{/key}
			</div>
		{/if}

		{#if showWatermarkMobile}
			{#if showWatermarkOpacitySlider}
				<div class="flex flex-col gap-1 py-1 px-4 pb-px">
					<div class="relative flex items-center h-7.5 px-1">
						<div class="editor-mobile-slider-dots absolute inset-x-3 top-[42%] h-1.5 pointer-events-none -translate-y-1/2" aria-hidden="true"></div>
						<div
							class="absolute top-[42%] z-2 w-3.5 h-3.5 pointer-events-none bg-white rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.35)] -translate-x-1/2 -translate-y-1/2"
							style="--slider-progress: {watermarkOpacityProgress}; left: calc(0.75rem + (100% - 1.5rem) * var(--slider-progress, 0.5))"
							aria-hidden="true"
						></div>
						<input aria-label="Watermark opacity"
							type="range"
							class="editor-mobile-slider-input relative z-3 w-full h-7.5 m-0 appearance-none cursor-pointer bg-transparent rounded-full"
							min="0"
							max="1"
							step="0.01"
							value={watermarkProps?.currentOpacity ?? 0.8}
							oninput={handleWatermarkOpacityInput}
							onchange={handleWatermarkOpacityCommit}
							aria-valuetext="{watermarkOpacity} percent"
						/>
					</div>
					<div class="text-[11px] font-medium leading-none text-center text-[rgba(255,255,255,0.72)] tabular-nums">{watermarkOpacity}%</div>
				</div>
			{/if}

			{#if showWatermarkTextInput}
				<div class="flex items-center gap-1.5 w-full min-w-0 max-w-full py-0.5 px-2.5 pb-1 box-border">
					<label class="flex-[0_0_auto] text-[11px] font-medium uppercase tracking-[0.04em] text-[rgba(255,255,255,0.52)]" for="watermark-mobile-text">Text</label>
					<input aria-label="Watermark text"
						id="watermark-mobile-text"
						class="flex-[1_1_auto] min-w-0 h-8 px-3 text-[13px] text-[rgba(255,255,255,0.92)] bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.1)] rounded-full outline-none focus-visible:border-[rgba(255,255,255,0.28)] focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.12)]"
						type="text"
						value={watermarkProps?.textDraft ?? 'Watermark'}
						placeholder="Watermark text"
						oninput={handleWatermarkTextInput}
					/>
					<button
						type="button"
						class="flex-[0_0_auto] h-8 px-3 text-xs font-medium text-[rgba(255,255,255,0.92)] cursor-pointer bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.12)] rounded-full transition-[background] duration-150 active:bg-[rgba(255,255,255,0.18)]"
						onclick={() => watermarkProps?.onApplyText?.()}
						aria-label="Apply watermark text"
					>
						Apply
					</button>
				</div>
			{/if}

			<div class="flex justify-center w-full min-w-0 max-w-full py-0.5 px-2.5 pb-1 box-border">
				{#key toolbarControls!.component}
					{const Component = toolbarControls!.component}
					<Component {...toolbarControls!.props} />
				{/key}
			</div>
		{/if}

		{#if showFocalMobile}
			<div class="flex flex-col gap-1 py-1 px-4 pb-px">
				<div class="text-[11px] font-semibold leading-none text-center uppercase tracking-[0.06em] text-[rgba(255,255,255,0.52)]">X</div>
				<div class="relative flex items-center h-7.5 px-1">
					<div class="editor-mobile-slider-dots absolute inset-x-3 top-[42%] h-1.5 pointer-events-none -translate-y-1/2" aria-hidden="true"></div>
					<div
						class="absolute top-[42%] z-2 w-3.5 h-3.5 pointer-events-none bg-white rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.35)] -translate-x-1/2 -translate-y-1/2"
						style="--slider-progress: {focalXProgress}; left: calc(0.75rem + (100% - 1.5rem) * var(--slider-progress, 0.5))"
						aria-hidden="true"
					></div>
					<input aria-label="Focal point X"
						type="range"
						class="editor-mobile-slider-input relative z-3 w-full h-7.5 m-0 appearance-none cursor-pointer bg-transparent rounded-full"
						min="0"
						max="100"
						step="1"
						value={focalX}
						oninput={handleFocalXInput}
						onchange={handleFocalCommit}
						aria-valuetext="{focalX} percent"
					/>
				</div>
				<div class="text-[11px] font-medium leading-none text-center text-[rgba(255,255,255,0.72)] tabular-nums">{focalX}%</div>
			</div>

			<div class="flex flex-col gap-1 py-1 px-4 pb-px">
				<div class="text-[11px] font-semibold leading-none text-center uppercase tracking-[0.06em] text-[rgba(255,255,255,0.52)]">Y</div>
				<div class="relative flex items-center h-7.5 px-1">
					<div class="editor-mobile-slider-dots absolute inset-x-3 top-[42%] h-1.5 pointer-events-none -translate-y-1/2" aria-hidden="true"></div>
					<div
						class="absolute top-[42%] z-2 w-3.5 h-3.5 pointer-events-none bg-white rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.35)] -translate-x-1/2 -translate-y-1/2"
						style="--slider-progress: {focalYProgress}; left: calc(0.75rem + (100% - 1.5rem) * var(--slider-progress, 0.5))"
						aria-hidden="true"
					></div>
					<input aria-label="Focal point Y"
						type="range"
						class="editor-mobile-slider-input relative z-3 w-full h-7.5 m-0 appearance-none cursor-pointer bg-transparent rounded-full"
						min="0"
						max="100"
						step="1"
						value={focalY}
						oninput={handleFocalYInput}
						onchange={handleFocalCommit}
						aria-valuetext="{focalY} percent"
					/>
				</div>
				<div class="text-[11px] font-medium leading-none text-center text-[rgba(255,255,255,0.72)] tabular-nums">{focalY}%</div>
			</div>

			<div class="flex justify-center w-full min-w-0 max-w-full py-0.5 px-2.5 pb-1 box-border">
				{#key toolbarControls!.component}
					{const Component = toolbarControls!.component}
					<Component {...toolbarControls!.props} />
				{/key}
			</div>
		{/if}

		{#if showCropControls || showToolControls}
			<section class="editor-mobile-tool-sheet w-full py-1 px-3 pb-2 bg-transparent" data-tool={activeTool} aria-label="{toolSheetLabel} controls">
				<div class="p-0 w-full min-w-0">
					{#key toolbarControls!.component}
						{const Component = toolbarControls!.component}
						<Component {...toolbarControls!.props} />
					{/key}
				</div>
			</section>
		{/if}
	</div>

	<EditorMobileToolRail {hasImage} {onToolSelect} />
</div>

	<style>
		/* ── Mobile chip custom properties ── */
		.editor-mobile-tool-sheet {
			--mc-chip: rgba(255, 255, 255, 0.09);
			--mc-chip-active: rgba(255, 255, 255, 0.94);
			--mc-chip-text: rgba(255, 255, 255, 0.62);
			--mc-chip-text-active: #141414;
			--mc-label: rgba(255, 255, 255, 0.45);
			--mc-field: rgba(255, 255, 255, 0.08);
			--mc-field-focus: rgba(255, 255, 255, 0.13);
			--mc-pill-h: 2.125rem;
			/* Override editor chrome tokens for mobile context */
			--editor-chrome-text: var(--mc-chip-text);
			--editor-chrome-text-active: var(--mc-chip-text-active);
			--editor-chrome-text-hover: rgba(255, 255, 255, 0.92);
			--editor-chrome-elevated: var(--mc-chip);
			--editor-chrome-border: transparent;
		}

		/* ── Slider visual dots background (can't inline gradient) ── */
		.editor-mobile-slider-dots {
			background-image:
				radial-gradient(circle, rgba(255, 255, 255, 0.55) 1.5px, transparent 1.5px),
				radial-gradient(circle, rgba(255, 255, 255, 0.22) 1px, transparent 1px);
			background-repeat: repeat-x, repeat-x;
			background-position:
				center,
				calc(50% + 5px) center;
			background-size:
				20px 6px,
				10px 6px;
		}

		/* ── Range input pseudo-element thumbs (can't do with Tailwind) ── */
		.editor-mobile-slider-input::-webkit-slider-runnable-track {
			height: 4px;
			background: transparent;
			border-radius: 9999px;
		}

		.editor-mobile-slider-input::-webkit-slider-thumb {
			width: 28px;
			height: 28px;
			margin-top: -12px;
			appearance: none;
			cursor: pointer;
			background: transparent;
			border: none;
			box-shadow: none;
		}

		.editor-mobile-slider-input::-moz-range-track {
			height: 4px;
			background: transparent;
			border-radius: 9999px;
		}

		.editor-mobile-slider-input::-moz-range-thumb {
			width: 28px;
			height: 28px;
			cursor: pointer;
			background: transparent;
			border: none;
			box-shadow: none;
		}

		/* ── Mobile dock overrides (via structural selectors targeting Tailwind-ified controls) ── */

		/* Outer toolbar gap */
		.editor-mobile-tool-sheet :global([role="toolbar"].flex-col) {
			gap: 0.625rem;
			width: 100%;
			min-width: 0;
		}

		/* Row wrappers: wrap instead of scroll, hide scrollbar */
		.editor-mobile-tool-sheet :global([role="toolbar"] > .flex.flex-wrap) {
			flex-wrap: wrap !important;
			justify-content: center;
			gap: 0.375rem;
			padding: 0;
			overflow: visible;
			background: transparent;
		}

		.editor-mobile-tool-sheet :global([role="toolbar"] > .flex.flex-wrap::-webkit-scrollbar) {
			display: none;
		}

		.editor-mobile-tool-sheet :global([role="toolbar"] > .flex.flex-wrap > *) {
			flex-shrink: 0;
		}

		/* Pill group containers: remove chrome background/border, use gap */
		.editor-mobile-tool-sheet :global([role="group"].inline-flex),
		.editor-mobile-tool-sheet :global([role="tablist"].flex.flex-wrap + .inline-flex),
		.editor-mobile-tool-sheet :global(.inline-flex.rounded-full.bg-\[--editor-chrome-elevated\]) {
			display: inline-flex;
			flex-shrink: 0;
			gap: 0.375rem;
			align-items: center;
			padding: 0;
			background: transparent;
			border: none;
			border-radius: 0;
		}

		/* Mobile pill buttons: larger touch targets, visible bg */
		.editor-mobile-tool-sheet :global([role="toolbar"] button),
		.editor-mobile-tool-sheet :global([role="group"] button),
		.editor-mobile-tool-sheet :global([role="tablist"] button),
		.editor-mobile-tool-sheet :global(label.inline-flex button) {
			display: inline-flex;
			gap: 0.3125rem;
			align-items: center;
			justify-content: center;
			height: var(--mc-pill-h) !important;
			min-height: var(--mc-pill-h) !important;
			padding-inline: 0.875rem;
			font-size: 0.8125rem;
			font-weight: 500;
			line-height: 1;
			color: var(--mc-chip-text);
			background: var(--mc-chip);
			border: none;
			border-radius: 9999px;
			box-shadow: none;
			outline: none;
			transition:
				background 0.16s ease,
				color 0.16s ease,
				transform 0.12s ease;
		}

		.editor-mobile-tool-sheet :global([role="toolbar"] button:active:not(:disabled)),
		.editor-mobile-tool-sheet :global([role="group"] button:active:not(:disabled)) {
			transform: scale(0.96);
		}

		/* Active pill (text-white bg-white/10 etc.) → mobile active */
		.editor-mobile-tool-sheet :global([role="toolbar"] button.bg-white\/\[0\.1\]),
		.editor-mobile-tool-sheet :global([role="group"] button.bg-white\/\[0\.1\]),
		.editor-mobile-tool-sheet :global([role="toolbar"] button.bg-white\/8) {
			color: var(--mc-chip-text-active);
			background: var(--mc-chip-active);
		}

		/* Changed (non-active) pill */
		.editor-mobile-tool-sheet :global([role="toolbar"] button.text-\[rgba\(255\,255\,255\,0\.85\)\]:not(.bg-white\/\[0\.1\])),
		.editor-mobile-tool-sheet :global([role="group"] button.text-\[rgba\(255\,255\,255\,0\.85\)\]:not(.bg-white\/\[0\.1\])) {
			color: rgba(255, 255, 255, 0.88);
			background: rgba(255, 255, 255, 0.12);
		}

		.editor-mobile-tool-sheet :global([role="toolbar"] button iconify-icon),
		.editor-mobile-tool-sheet :global([role="group"] button iconify-icon) {
			flex-shrink: 0;
		}

		/* Badge text */
		.editor-mobile-tool-sheet :global([role="toolbar"] .font-semibold.text-\[9px\]) {
			padding-inline: 0.25rem;
			font-size: 0.75rem;
			font-weight: 500;
			color: var(--mc-label);
			background: transparent;
		}

		/* Primary CTA (apply button) */
		.editor-mobile-tool-sheet :global([role="toolbar"] button.text-\[rgba\(255\,255\,255\,0\.92\)\].bg-white\/8) {
			color: #111 !important;
			background: var(--editor-accent, #f4c430) !important;
		}

		.editor-mobile-tool-sheet :global([role="group"][aria-label="Blur actions"] button:nth-last-child(2)) {
			color: rgba(255, 255, 255, 0.48);
			background: rgba(255, 255, 255, 0.06);
		}

		/* ── Sliders (mobile overrides) ── */
		.editor-mobile-tool-sheet :global(.flex.flex-col.gap-1.w-full.max-w-\[36rem\]) {
			gap: 0.4375rem;
			width: 100%;
			margin: 0;
			padding: 0;
			background: transparent;
		}

		.editor-mobile-tool-sheet :global(.flex.items-center.justify-between) {
			align-items: center;
			min-height: 1rem;
		}

		/* Slider label */
		.editor-mobile-tool-sheet :global(.lowercase.text-\[11px\].font-normal.text-\[rgba\(255\,255\,255\,0\.45\)\]) {
			font-size: 0.75rem;
			font-weight: 500;
			color: var(--mc-label);
		}

		.editor-mobile-tool-sheet :global(.flex.gap-2\.5.items-center) {
			gap: 0.75rem;
			align-items: center;
			min-width: 0;
		}

		/* Slider input (type=range) */
		.editor-mobile-tool-sheet :global(input[type="range"]) {
			flex: 1;
			min-width: 0;
			height: 3px !important;
			background: rgba(255, 255, 255, 0.12);
			border-radius: 9999px;
		}

		.editor-mobile-tool-sheet :global(input[type="range"]::-webkit-slider-thumb) {
			width: 18px;
			height: 18px;
			appearance: none;
			background: #fff;
			border: none;
			border-radius: 50%;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
		}

		.editor-mobile-tool-sheet :global(input[type="range"]::-moz-range-thumb) {
			width: 18px;
			height: 18px;
			background: #fff;
			border: none;
			border-radius: 50%;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
		}

		/* Slider value text */
		.editor-mobile-tool-sheet :global(.min-w-8.text-xs.font-medium.text-end) {
			min-width: 2.25rem;
			font-size: 0.8125rem;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
			color: var(--mc-label);
		}

		.editor-mobile-tool-sheet :global(.text-white.min-w-8) {
			color: #fff;
		}

		/* Icon buttons */
		.editor-mobile-tool-sheet :global(.size-6.inline-flex.items-center.justify-center) {
			width: 2rem;
			height: 2rem;
			color: var(--mc-label);
			background: var(--mc-chip);
			border: none;
			border-radius: 50%;
		}

		/* Dock inputs */
		.editor-mobile-tool-sheet :global(input[type="text"].bg-white\/\[0\.06\]),
		.editor-mobile-tool-sheet :global(input[type="number"].bg-white\/\[0\.06\]) {
			height: 2.125rem;
			padding-inline: 0.625rem;
			font-size: 0.8125rem;
			color: #fff;
			background: var(--mc-field);
			border: none;
			border-radius: 0.625rem;
			outline: none;
		}

		.editor-mobile-tool-sheet :global(input[type="text"].bg-white\/\[0\.06\]:focus),
		.editor-mobile-tool-sheet :global(input[type="number"].bg-white\/\[0\.06\]:focus) {
			background: var(--mc-field-focus);
		}

		/* Hint text */
		.editor-mobile-tool-sheet :global(.text-\[10px\].italic.text-\[rgba\(255\,255\,255\,0\.4\)\]) {
			display: none;
		}

		/* ── Crop (mobile-only component) ── */
		.editor-mobile-tool-sheet[data-tool="crop"] {
			padding: 0.125rem 0.625rem 0.25rem;
		}

		.editor-mobile-tool-sheet[data-tool="crop"] :global(.crop-controls-mobile) {
			display: flex;
			justify-content: center;
			width: 100%;
		}

		.editor-mobile-tool-sheet[data-tool="crop"] :global(.crop-mobile-strip) {
			width: fit-content;
			max-width: 100%;
			gap: 0.125rem;
			padding: 0.125rem;
		}

		.editor-mobile-tool-sheet[data-tool="crop"] :global(.crop-mobile-pill) {
			height: 1.75rem;
			padding-inline: 0.5625rem;
			font-size: 0.75rem;
		}

		.editor-mobile-tool-sheet[data-tool="crop"] :global(.crop-mobile-pill-active) {
			color: var(--mc-chip-text-active);
			background: var(--mc-chip-active);
		}

		/* Tool sheet itself */
	</style>
