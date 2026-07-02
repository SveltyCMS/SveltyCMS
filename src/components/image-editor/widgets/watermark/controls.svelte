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

<div class="flex flex-col flex-[0_0_auto] gap-1 items-stretch w-full min-w-0 h-auto leading-none" role="toolbar" aria-label="Watermark controls">
	<div class="flex flex-wrap gap-1.5 items-center justify-center w-full min-w-0 min-h-0 leading-none flex-nowrap overflow-x-auto overflow-y-hidden pb-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
		<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onclick={onAddImage} title="Add image watermark (I)">
			<iconify-icon icon="mdi:image-plus" width="15" aria-hidden="true"></iconify-icon>
			<span>Add image</span>
		</button>

		{#if onAddText}
			<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onclick={onAddText} title="Add text watermark (T)">
				<iconify-icon icon="mdi:text-box-plus" width="15" aria-hidden="true"></iconify-icon>
				<span>Add text</span>
			</button>
		{/if}

		{#if watermarkCount > 0}
			<span class="text-[9px] font-semibold text-[rgba(255,255,255,0.45)]">{watermarkCount} active</span>
		{/if}

		{#if hasSelection}
			<button
				type="button"
				class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
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
		<div class="flex flex-wrap gap-1.5 items-center justify-center w-full min-w-0 min-h-0 leading-none flex-nowrap overflow-x-auto overflow-y-hidden pb-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
			<label class="text-[11px] font-normal text-[rgba(255,255,255,0.45)] lowercase" for="watermark-text">text</label>
			<input aria-label="Opacity"
				id="watermark-text"
				type="text"
				class="h-7 px-2 text-[11px] font-medium text-white bg-white/6 border border-white/[0.1] rounded-md outline-none focus:border-white/[0.25] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] [&[type=number]]:[appearance:textfield] min-w-40 flex-1"
				value={textDraft}
				placeholder="Watermark text"
				oninput={(e) => onTextDraftChange(e.currentTarget.value)}
			/>
			<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium whitespace-nowrap cursor-pointer rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35 text-white bg-white/[0.1] border-white/[0.14]" onclick={onApplyText || (() => undefined)}>
				Apply
			</button>
		</div>
	{/if}

	{#if hasSelection}
		<div class="flex flex-wrap gap-1.5 items-center justify-center w-full min-w-0 min-h-0 leading-none flex-nowrap overflow-x-auto overflow-y-hidden pb-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
			<span class="text-[11px] font-normal text-[rgba(255,255,255,0.45)] lowercase">position</span>
			<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full grid grid-cols-3 gap-0.5 p-0.5 rounded-lg">
				{#each positions as pos (pos.value)}
					<button
						type="button"
						class="inline-flex flex-[0_0_auto] gap-1.5 items-center justify-center min-w-7 px-[0.35rem] h-7 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
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
			<div class="flex flex-wrap gap-1.5 items-center justify-center w-full min-w-0 min-h-0 leading-none flex-nowrap overflow-x-auto overflow-y-hidden pb-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
				{#if onOpacityChange}
					<div class="flex flex-col gap-1 w-full max-w-[36rem] mx-auto flex-[1_1_10rem] max-w-64 mx-0">
						<div class="flex items-center justify-between">
							<span class="text-[11px] font-normal text-[rgba(255,255,255,0.45)] lowercase">opacity</span>
							<span class="min-w-8 text-xs font-medium text-[rgba(255,255,255,0.45)] text-end text-white">{Math.round(currentOpacity * 100)}%</span>
						</div>
						<div class="flex gap-2.5 items-center">
							<input aria-label="Scale"
								type="range"
								min="0"
								max="1"
								step="0.01"
								value={currentOpacity}
								oninput={handleOpacityInput}
								class="flex-1 h-1 m-0 appearance-none cursor-pointer bg-white/[0.18] rounded-full [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-transparent [&::-moz-range-thumb]:rounded-full"
							/>
						</div>
					</div>
				{/if}

				{#if onSizeChange}
					{#each sizePresets as preset (preset.value)}
						<button
							type="button"
							class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
							class:text-white={Math.abs(currentSize - preset.value) < 5}
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
						class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
						class:text-white={isTiled}
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
