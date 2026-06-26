<!--
@file: src/components/image-editor/widgets/watermark/controls.svelte
@component
Pintura-style watermark bottom dock controls.
-->
<script lang="ts">
	let {
		onAddImage,
		onAddText,
		onDeleteWatermark,
		onPositionChange,
		onOpacityChange,
		onSizeChange,
		onTileToggle,
		hasSelection,
		selectedType = null,
		textDraft = 'Watermark',
		onTextDraftChange,
		onApplyText,
		currentOpacity = 0.8,
		currentSize = 100,
		isTiled = false,
		watermarkCount = 0
	}: {
		onAddImage: () => void;
		onAddText?: () => void;
		onDeleteWatermark: () => void;
		onPositionChange: (position: string) => void;
		onOpacityChange?: (opacity: number) => void;
		onSizeChange?: (size: number) => void;
		onTileToggle?: () => void;
		hasSelection: boolean;
		selectedType?: 'text' | 'image' | null;
		textDraft?: string;
		onTextDraftChange?: (value: string) => void;
		onApplyText?: () => void;
		currentOpacity?: number;
		currentSize?: number;
		isTiled?: boolean;
		watermarkCount?: number;
	} = $props();

	const positions = [
		{ label: '↖', value: 'northwest', title: 'Top Left' },
		{ label: '↑', value: 'north', title: 'Top Center' },
		{ label: '↗', value: 'northeast', title: 'Top Right' },
		{ label: '←', value: 'west', title: 'Middle Left' },
		{ label: '●', value: 'center', title: 'Center' },
		{ label: '→', value: 'east', title: 'Middle Right' },
		{ label: '↙', value: 'southwest', title: 'Bottom Left' },
		{ label: '↓', value: 'south', title: 'Bottom Center' },
		{ label: '↘', value: 'southeast', title: 'Bottom Right' }
	];

	const sizePresets = [
		{ label: 'XS', value: 50 },
		{ label: 'S', value: 75 },
		{ label: 'M', value: 100 },
		{ label: 'L', value: 150 },
		{ label: 'XL', value: 200 }
	];

	function handleOpacityInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		onOpacityChange?.(Number.parseFloat(target.value));
	}

	function handleKeyDown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).tagName === 'INPUT') return;

		switch (e.key) {
			case 'Delete':
			case 'Backspace':
				if (hasSelection) {
					e.preventDefault();
					onDeleteWatermark();
				}
				break;
			case 't':
			case 'T':
				if (onAddText) {
					e.preventDefault();
					onAddText();
				}
				break;
			case 'i':
			case 'I':
				e.preventDefault();
				onAddImage();
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="editor-dock" role="toolbar" aria-label="Watermark controls">
	<div class="dock-row dock-row-scroll">
		<button type="button" class="dock-pill" onclick={onAddImage} title="Add image watermark (I)">
			<iconify-icon icon="mdi:image-plus" width="15" aria-hidden="true"></iconify-icon>
			<span>Add image</span>
		</button>

		{#if onAddText}
			<button type="button" class="dock-pill" onclick={onAddText} title="Add text watermark (T)">
				<iconify-icon icon="mdi:text-box-plus" width="15" aria-hidden="true"></iconify-icon>
				<span>Add text</span>
			</button>
		{/if}

		{#if watermarkCount > 0}
			<span class="dock-pill-badge">{watermarkCount} active</span>
		{/if}

		{#if hasSelection}
			<button
				type="button"
				class="dock-pill"
				onclick={onDeleteWatermark}
				title="Delete watermark"
				aria-label="Delete watermark"
			>
				<iconify-icon icon="mdi:delete" width="15" aria-hidden="true"></iconify-icon>
				<span>Delete</span>
			</button>
		{/if}
	</div>

	{#if selectedType === 'text' && onTextDraftChange}
		<div class="dock-row dock-row-scroll">
			<label class="slider-label" for="watermark-text">text</label>
			<input
				id="watermark-text"
				type="text"
				class="dock-input min-w-[10rem] flex-1"
				value={textDraft}
				placeholder="Watermark text"
				oninput={(e) => onTextDraftChange(e.currentTarget.value)}
			/>
			<button type="button" class="dock-pill dock-pill-active" onclick={onApplyText || (() => undefined)}>
				Apply
			</button>
		</div>
	{/if}

	{#if hasSelection}
		<div class="dock-row dock-row-scroll">
			<span class="slider-label">position</span>
			<div class="dock-pill-group position-grid">
				{#each positions as pos (pos.value)}
					<button
						type="button"
						class="dock-pill position-pill"
						onclick={() => onPositionChange(pos.value)}
						title={pos.title}
						aria-label={pos.title}
					>
						{pos.label}
					</button>
				{/each}
			</div>
		</div>

		{#if onOpacityChange || onSizeChange || onTileToggle}
			<div class="dock-row dock-row-scroll">
				{#if onOpacityChange}
					<div class="slider-block watermark-opacity-block">
						<div class="slider-header">
							<span class="slider-label">opacity</span>
							<span class="slider-value slider-value-changed">{Math.round(currentOpacity * 100)}%</span>
						</div>
						<div class="slider-track">
							<input
								type="range"
								min="0"
								max="1"
								step="0.01"
								value={currentOpacity}
								oninput={handleOpacityInput}
								class="slider-input"
								aria-label="Watermark opacity"
							/>
						</div>
					</div>
				{/if}

				{#if onSizeChange}
					{#each sizePresets as preset (preset.value)}
						<button
							type="button"
							class="dock-pill"
							class:dock-pill-active={Math.abs(currentSize - preset.value) < 5}
							onclick={() => onSizeChange(preset.value)}
							title="{preset.label} ({preset.value}%)"
						>
							{preset.label}
						</button>
					{/each}
				{/if}

				{#if onTileToggle}
					<button
						type="button"
						class="dock-pill"
						class:dock-pill-active={isTiled}
						onclick={onTileToggle}
						title="Tile watermark"
						aria-label="Tile watermark across image"
						aria-pressed={isTiled}
					>
						<iconify-icon icon="mdi:view-grid" width="15" aria-hidden="true"></iconify-icon>
						<span>Tile</span>
					</button>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	@import '../../editor-dock.css';

	.position-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.125rem;
		padding: 0.125rem;
		border-radius: 0.5rem;
	}

	.position-pill {
		justify-content: center;
		min-width: 1.75rem;
		padding-inline: 0.35rem;
	}

	.watermark-opacity-block {
		flex: 1 1 10rem;
		max-width: 16rem;
		margin-inline: 0;
	}
</style>
