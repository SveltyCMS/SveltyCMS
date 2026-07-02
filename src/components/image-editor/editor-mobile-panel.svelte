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

<div class="editor-mobile-panel">
	<div class="editor-mobile-controls-area">
		{#if showTransformSlider}
			<div class="editor-mobile-slider-block" class:editor-mobile-slider-block--scale={!useRotationSlider}>
				<div class="editor-mobile-slider-track">
					<div class="editor-mobile-slider-dots" aria-hidden="true"></div>
					{#if useRotationSlider}
						<div class="editor-mobile-slider-center-wrap" aria-hidden="true">
							<div class="editor-mobile-slider-center"></div>
						</div>
					{/if}
					<div
						class="editor-mobile-slider-thumb"
						style="--slider-progress: {sliderProgress}"
						aria-hidden="true"
					></div>
					<input aria-label={useRotationSlider ? 'Rotation angle' : 'Scale'}
						type="range"
						class="editor-mobile-slider-input"
						class:editor-mobile-slider-input--scale={!useRotationSlider}
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
					<div class="editor-mobile-slider-label">{rotationDisplay}°</div>
				{:else}
					<div class="editor-mobile-slider-label">{zoomPercent}%</div>
				{/if}
			</div>

			{#if showRotationScalePills}
				<div class="editor-mobile-mode-row" role="tablist" aria-label="Adjust mode">
					<div class="editor-mobile-mode-track">
						<button
							type="button"
							class="editor-mobile-mode-pill"
							class:editor-mobile-mode-pill-active={adjustMode === 'rotation'}
							role="tab"
							aria-selected={adjustMode === 'rotation'}
							onclick={() => (adjustMode = 'rotation')}
						>
							Rotation
						</button>
						<button
							type="button"
							class="editor-mobile-mode-pill"
							class:editor-mobile-mode-pill-active={adjustMode === 'scale'}
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
			<div class="editor-mobile-slider-block">
				<div class="editor-mobile-slider-track">
					<div class="editor-mobile-slider-dots" aria-hidden="true"></div>
					<div class="editor-mobile-slider-center-wrap" aria-hidden="true">
						<div class="editor-mobile-slider-center"></div>
					</div>
					<div
						class="editor-mobile-slider-thumb"
						style="--slider-progress: {finetuneSliderProgress}"
						aria-hidden="true"
					></div>
					<input aria-label={finetuneConfig?.label ?? 'Adjustment'}
						type="range"
						class="editor-mobile-slider-input"
						min={finetuneMin}
						max={finetuneMax}
						step={finetuneStep}
						value={finetuneValue}
						oninput={handleFinetuneInput}
						onchange={handleFinetuneCommit}
						aria-valuetext={finetuneValueLabel}
					/>
				</div>
				<div class="editor-mobile-slider-label">{finetuneValueLabel}</div>
			</div>

			<div class="editor-mobile-finetune-area">
				{#key toolbarControls!.component}
					{const Component = toolbarControls!.component}
					<Component {...toolbarControls!.props} />
				{/key}
			</div>
		{/if}

		{#if showBlurMobile}
			<div class="editor-mobile-slider-block editor-mobile-slider-block--scale">
				<div class="editor-mobile-slider-track">
					<div class="editor-mobile-slider-dots" aria-hidden="true"></div>
					<div
						class="editor-mobile-slider-thumb"
						style="--slider-progress: {blurSliderProgress}"
						aria-hidden="true"
					></div>
					<input aria-label="Blur strength"
						type="range"
						class="editor-mobile-slider-input editor-mobile-slider-input--scale"
						min="5"
						max="100"
						step="1"
						value={blurStrength}
						oninput={handleBlurInput}
						onchange={handleBlurCommit}
						aria-valuetext="{blurStrength} percent"
					/>
				</div>
				<div class="editor-mobile-slider-label">{blurStrength}</div>
			</div>

			<div class="editor-mobile-blur-area">
				{#key toolbarControls!.component}
					{const Component = toolbarControls!.component}
					<Component {...toolbarControls!.props} />
				{/key}
			</div>
		{/if}

		{#if showAnnotateMobile}
			{#if showAnnotateTextInput}
				<div class="editor-mobile-annotate-text-row">
					<div class="editor-mobile-annotate-text-pill">
						<input aria-label="Annotation text"
							bind:this={annotateTextInputRef}
							id="annotate-mobile-text"
							class="editor-mobile-annotate-text-input"
							type="text"
							value={annotateProps?.textDraft ?? 'Text'}
							placeholder="Enter text"
							oninput={handleAnnotateTextInput}
							onkeydown={handleAnnotateTextKeydown}
						/>
						<button
							type="button"
							class="editor-mobile-annotate-text-confirm"
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

			<div class="editor-mobile-annotate-area">
				{#key toolbarControls!.component}
					{const Component = toolbarControls!.component}
					<Component {...toolbarControls!.props} />
				{/key}
			</div>
		{/if}

		{#if showWatermarkMobile}
			{#if showWatermarkOpacitySlider}
				<div class="editor-mobile-slider-block editor-mobile-slider-block--scale">
					<div class="editor-mobile-slider-track">
						<div class="editor-mobile-slider-dots" aria-hidden="true"></div>
						<div
							class="editor-mobile-slider-thumb"
							style="--slider-progress: {watermarkOpacityProgress}"
							aria-hidden="true"
						></div>
						<input aria-label="Watermark opacity"
							type="range"
							class="editor-mobile-slider-input editor-mobile-slider-input--scale"
							min="0"
							max="1"
							step="0.01"
							value={watermarkProps?.currentOpacity ?? 0.8}
							oninput={handleWatermarkOpacityInput}
							onchange={handleWatermarkOpacityCommit}
							aria-valuetext="{watermarkOpacity} percent"
						/>
					</div>
					<div class="editor-mobile-slider-label">{watermarkOpacity}%</div>
				</div>
			{/if}

			{#if showWatermarkTextInput}
				<div class="editor-mobile-watermark-text-row">
					<label class="editor-mobile-watermark-text-label" for="watermark-mobile-text">Text</label>
					<input aria-label="Watermark text"
						id="watermark-mobile-text"
						class="editor-mobile-watermark-text-input"
						type="text"
						value={watermarkProps?.textDraft ?? 'Watermark'}
						placeholder="Watermark text"
						oninput={handleWatermarkTextInput}
					/>
					<button
						type="button"
						class="editor-mobile-watermark-apply"
						onclick={() => watermarkProps?.onApplyText?.()}
						aria-label="Apply watermark text"
					>
						Apply
					</button>
				</div>
			{/if}

			<div class="editor-mobile-watermark-area">
				{#key toolbarControls!.component}
					{const Component = toolbarControls!.component}
					<Component {...toolbarControls!.props} />
				{/key}
			</div>
		{/if}

		{#if showFocalMobile}
			<div class="editor-mobile-slider-block editor-mobile-slider-block--scale">
				<div class="editor-mobile-slider-row-label">X</div>
				<div class="editor-mobile-slider-track">
					<div class="editor-mobile-slider-dots" aria-hidden="true"></div>
					<div
						class="editor-mobile-slider-thumb"
						style="--slider-progress: {focalXProgress}"
						aria-hidden="true"
					></div>
					<input aria-label="Focal point X"
						type="range"
						class="editor-mobile-slider-input editor-mobile-slider-input--scale"
						min="0"
						max="100"
						step="1"
						value={focalX}
						oninput={handleFocalXInput}
						onchange={handleFocalCommit}
						aria-valuetext="{focalX} percent"
					/>
				</div>
				<div class="editor-mobile-slider-label">{focalX}%</div>
			</div>

			<div class="editor-mobile-slider-block editor-mobile-slider-block--scale">
				<div class="editor-mobile-slider-row-label">Y</div>
				<div class="editor-mobile-slider-track">
					<div class="editor-mobile-slider-dots" aria-hidden="true"></div>
					<div
						class="editor-mobile-slider-thumb"
						style="--slider-progress: {focalYProgress}"
						aria-hidden="true"
					></div>
					<input aria-label="Focal point Y"
						type="range"
						class="editor-mobile-slider-input editor-mobile-slider-input--scale"
						min="0"
						max="100"
						step="1"
						value={focalY}
						oninput={handleFocalYInput}
						onchange={handleFocalCommit}
						aria-valuetext="{focalY} percent"
					/>
				</div>
				<div class="editor-mobile-slider-label">{focalY}%</div>
			</div>

			<div class="editor-mobile-focal-area">
				{#key toolbarControls!.component}
					{const Component = toolbarControls!.component}
					<Component {...toolbarControls!.props} />
				{/key}
			</div>
		{/if}

		{#if showCropControls || showToolControls}
			<section class="editor-mobile-tool-sheet" data-tool={activeTool} aria-label="{toolSheetLabel} controls">
				<div class="editor-mobile-controls">
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
