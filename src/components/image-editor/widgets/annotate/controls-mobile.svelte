<!--
@file src/components/image-editor/widgets/annotate/controls-mobile.svelte
@component
Mobile annotate controls — single centered scroll strip; preset swatches + custom picker.
-->
<script lang="ts">
	type ToolType = 'text' | 'arrow' | 'rectangle' | 'circle' | null;

	let {
		currentTool,
		strokeColor,
		fillColor,
		hasSelection = false,
		onSetTool,
		onStrokeColorChange,
		onFillColorChange,
		onDeleteAnnotation
	}: {
		currentTool: ToolType;
		strokeColor: string;
		fillColor: string;
		hasSelection?: boolean;
		onSetTool: (tool: ToolType) => void;
		onStrokeColorChange: (color: string) => void;
		onFillColorChange: (color: string) => void;
		onDeleteAnnotation?: () => void;
	} = $props();

	const annotateTools: { id: Exclude<ToolType, null>; label: string; icon: string }[] = [
		{ id: 'text', label: 'Text', icon: 'mdi:format-text' },
		{ id: 'arrow', label: 'Arrow', icon: 'mdi:arrow-top-right' },
		{ id: 'rectangle', label: 'Rectangle', icon: 'mdi:rectangle-outline' },
		{ id: 'circle', label: 'Ellipse', icon: 'mdi:circle-outline' }
	];

	const strokePresets = ['#ef4444', '#ffffff', '#000000', '#3b82f6', '#22c55e', '#eab308'] as const;
	const fillPresets = ['transparent', '#ffffff', '#000000', '#ffffff80'] as const;

	let strokePickerRef = $state<HTMLInputElement | null>(null);
	let fillPickerRef = $state<HTMLInputElement | null>(null);

	function handleKeyDown(e: KeyboardEvent) {
		if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') {
			return;
		}

		if ((e.key === 'Delete' || e.key === 'Backspace') && hasSelection && onDeleteAnnotation) {
			e.preventDefault();
			onDeleteAnnotation();
		}
	}

	function isStrokePreset(color: string): boolean {
		return strokePresets.includes(color.toLowerCase() as (typeof strokePresets)[number]);
	}

	function isFillPreset(color: string): boolean {
		return fillPresets.includes(color.toLowerCase() as (typeof fillPresets)[number]);
	}

	function openStrokePicker() {
		strokePickerRef?.click();
	}

	function openFillPicker() {
		fillPickerRef?.click();
	}

	function fillSwatchStyle(color: string): string {
		if (color === 'transparent') {
			return 'transparent';
		}
		return color;
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="annotate-controls-mobile" role="toolbar" aria-label="Annotate controls">
	<div class="annotate-mobile-strip" role="group" aria-label="Annotation tools and colors">
		{#each annotateTools as tool (tool.id)}
			<button
				type="button"
				class="annotate-mobile-pill annotate-mobile-tool-pill"
				class:annotate-mobile-pill-active={currentTool === tool.id}
				onclick={() => onSetTool(currentTool === tool.id ? null : tool.id)}
				aria-label={tool.label}
				aria-pressed={currentTool === tool.id}
			>
				<iconify-icon icon={tool.icon} width="16" aria-hidden="true"></iconify-icon>
			</button>
		{/each}

		<span class="annotate-mobile-divider" aria-hidden="true"></span>

		<span class="annotate-mobile-group-label" aria-hidden="true">Line</span>
		{#each strokePresets as color (color)}
			<button
				type="button"
				class="annotate-mobile-swatch-btn"
				class:annotate-mobile-swatch-btn-active={strokeColor.toLowerCase() === color}
				style:--swatch-color={color}
				onclick={() => onStrokeColorChange(color)}
				aria-label="Stroke color {color}"
				aria-pressed={strokeColor.toLowerCase() === color}
			></button>
		{/each}
		<button
			type="button"
			class="annotate-mobile-swatch-btn annotate-mobile-swatch-btn-custom"
			class:annotate-mobile-swatch-btn-active={!isStrokePreset(strokeColor)}
			style:--swatch-color={isStrokePreset(strokeColor) ? 'transparent' : strokeColor}
			onclick={openStrokePicker}
			aria-label="Custom stroke color"
		>
			<iconify-icon icon="mdi:palette-outline" width="12" aria-hidden="true"></iconify-icon>
		</button>

		<span class="annotate-mobile-divider" aria-hidden="true"></span>

		<span class="annotate-mobile-group-label" aria-hidden="true">Fill</span>
		{#each fillPresets as color (color)}
			<button
				type="button"
				class="annotate-mobile-swatch-btn"
				class:annotate-mobile-swatch-btn-transparent={color === 'transparent'}
				class:annotate-mobile-swatch-btn-active={fillColor.toLowerCase() === color}
				style:--swatch-color={fillSwatchStyle(color)}
				onclick={() => onFillColorChange(color)}
				aria-label="Fill color {color === 'transparent' ? 'none' : color}"
				aria-pressed={fillColor.toLowerCase() === color}
			></button>
		{/each}
		<button
			type="button"
			class="annotate-mobile-swatch-btn annotate-mobile-swatch-btn-custom"
			class:annotate-mobile-swatch-btn-active={!isFillPreset(fillColor)}
			style:--swatch-color={isFillPreset(fillColor) ? 'transparent' : fillColor}
			onclick={openFillPicker}
			aria-label="Custom fill color"
		>
			<iconify-icon icon="mdi:palette-outline" width="12" aria-hidden="true"></iconify-icon>
		</button>

		<span class="annotate-mobile-divider" aria-hidden="true"></span>

		<button
			type="button"
			class="annotate-mobile-pill annotate-mobile-delete-pill"
			class:annotate-mobile-pill-disabled={!hasSelection}
			onclick={() => onDeleteAnnotation?.()}
			disabled={!hasSelection || !onDeleteAnnotation}
			aria-label="Delete selected annotation"
		>
			Delete
		</button>
	</div>

	<!-- Fixed anchor for native pickers — keeps system UI on-screen on mobile -->
	<input aria-label="Font size"
		bind:this={strokePickerRef}
		type="color"
		class="annotate-hidden-color-input"
		value={strokeColor === 'transparent' ? '#ef4444' : strokeColor}
		oninput={(e) => onStrokeColorChange(e.currentTarget.value)}
		tabindex="-1"
		aria-hidden="true"
	/>
	<input aria-label="Stroke width"
		bind:this={fillPickerRef}
		type="color"
		class="annotate-hidden-color-input"
		value={fillColor === 'transparent' ? '#ffffff' : fillColor}
		oninput={(e) => onFillColorChange(e.currentTarget.value)}
		tabindex="-1"
		aria-hidden="true"
	/>
</div>

<style>
	.annotate-controls-mobile {
		display: flex;
		justify-content: center;
		width: 100%;
		min-width: 0;
	}

	.annotate-mobile-strip {
		display: inline-flex;
		flex-wrap: nowrap;
		gap: 0.1875rem;
		align-items: center;
		width: fit-content;
		max-width: 100%;
		padding: 0.1875rem 0.25rem;
		overflow-x: auto;
		overflow-y: hidden;
		-webkit-overflow-scrolling: touch;
		touch-action: pan-x;
		overscroll-behavior-x: contain;
		scroll-snap-type: x proximity;
		scrollbar-width: none;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: var(--editor-radius-pill, 9999px);
		backdrop-filter: blur(10px);
		box-sizing: border-box;
	}

	.annotate-mobile-strip::-webkit-scrollbar {
		display: none;
	}

	.annotate-mobile-group-label {
		flex: 0 0 auto;
		padding-inline: 0.125rem 0.0625rem;
		font-size: 0.5625rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.42);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		white-space: nowrap;
	}

	.annotate-mobile-divider {
		flex: 0 0 1px;
		align-self: stretch;
		width: 1px;
		min-height: 1.125rem;
		margin-inline: 0.0625rem;
		background: rgba(255, 255, 255, 0.14);
	}

	.annotate-mobile-pill {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		scroll-snap-align: center;
		height: 1.75rem;
		padding-inline: 0.5625rem;
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1;
		color: rgba(255, 255, 255, 0.72);
		white-space: nowrap;
		cursor: pointer;
		background: transparent;
		border: none;
		border-radius: var(--editor-radius-pill, 9999px);
		transition:
			background 0.15s ease,
			color 0.15s ease,
			transform 0.1s ease,
			opacity 0.15s ease;
	}

	.annotate-mobile-tool-pill {
		width: 1.875rem;
		min-width: 1.875rem;
		padding-inline: 0;
	}

	.annotate-mobile-delete-pill {
		padding-inline: 0.4375rem;
	}

	.annotate-mobile-pill:active:not(:disabled) {
		transform: scale(0.96);
	}

	.annotate-mobile-pill-active {
		color: #141414;
		background: rgba(255, 255, 255, 0.94);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14);
	}

	.annotate-mobile-pill-disabled,
	.annotate-mobile-pill:disabled {
		cursor: not-allowed;
		opacity: 0.38;
	}

	.annotate-mobile-swatch-btn {
		flex: 0 0 auto;
		width: 1.375rem;
		height: 1.375rem;
		padding: 0;
		cursor: pointer;
		background: var(--swatch-color, #fff);
		border: 2px solid rgba(255, 255, 255, 0.22);
		border-radius: 50%;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.18);
		transition:
			transform 0.1s ease,
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.annotate-mobile-swatch-btn-transparent {
		background:
			linear-gradient(135deg, rgba(255, 255, 255, 0.14) 46%, rgba(255, 255, 255, 0.45) 48%, rgba(255, 255, 255, 0.14) 50%),
			rgba(255, 255, 255, 0.06);
	}

	.annotate-mobile-swatch-btn-active {
		border-color: rgba(255, 255, 255, 0.92);
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.35),
			inset 0 1px 2px rgba(0, 0, 0, 0.18);
	}

	.annotate-mobile-swatch-btn-custom {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.72);
		background:
			linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.14)),
			var(--swatch-color, transparent);
	}

	.annotate-mobile-swatch-btn:active {
		transform: scale(0.92);
	}

	.annotate-hidden-color-input {
		position: fixed;
		bottom: calc(env(safe-area-inset-bottom, 0px) + 6.5rem);
		left: 50%;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: 0;
		pointer-events: none;
		visibility: hidden;
		opacity: 0;
		border: 0;
	}
</style>
