<!--
@file: src/components/image-editor/widgets/Watermark/Controls.svelte
@component
Professional watermark controls with text, image, and advanced options
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
		currentOpacity?: number;
		currentSize?: number;
		isTiled?: boolean;
		watermarkCount?: number;
	} = $props();

	// Position presets with better labels
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

	// Size presets (percentage of image width)
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

	// Keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).tagName === 'INPUT') {
			return;
		}

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

<div class="watermark-controls" role="toolbar" aria-label="Watermark controls">
	<!-- Group 1: Add Controls -->
	<div class="control-group">
		<div class="add-buttons">
			<button class="btn btn-sm preset-filled-primary-500" onclick={onAddImage} title="Add Image Watermark (I)">
				<iconify-icon icon="mdi:image-plus" width="18"></iconify-icon>
				<span class="hidden sm:inline">Add Image</span>
			</button>

			{#if onAddText}
				<button class="btn btn-sm preset-outlined-primary-500" onclick={onAddText} title="Add Text Watermark (T)">
					<iconify-icon icon="mdi:text-box-plus" width="18"></iconify-icon>
					<span class="hidden sm:inline">Add Text</span>
				</button>
			{/if}
		</div>

		{#if watermarkCount > 0}
			<div class="badge preset-filled-surface-200 text-xs"><span class="font-bold">{watermarkCount}</span></div>
		{/if}
	</div>

	{#if hasSelection}
		<div class="divider"></div>

		<!-- Group 2: Position -->
		<div class="control-group">
			<span class="control-label hidden md:flex">Position:</span>
			<div class="position-grid">
				{#each positions as pos (pos.value)}
					<button class="position-btn" onclick={() => onPositionChange(pos.value)} title={pos.title} aria-label={pos.title}>{pos.label}</button>
				{/each}
			</div>
		</div>

		<!-- Group 3: Style (Opacity, Size, Tiled) -->
		<div class="control-group flex-1">
			<!-- Opacity -->
			{#if onOpacityChange}
				<div class="slider-wrapper flex-1">
					<div class="slider-track-container">
						<input
							type="range"
							min="0"
							max="1"
							step="0.01"
							value={currentOpacity}
							oninput={handleOpacityInput}
							class="slider"
							aria-label="Watermark opacity"
							title="Opacity: {Math.round(currentOpacity * 100)}%"
						/>
					</div>
					<div class="slider-value">{Math.round(currentOpacity * 100)}%</div>
				</div>
			{/if}

			{#if onSizeChange}
				<div class="size-presets hidden sm:flex">
					{#each sizePresets as preset (preset.value)}
						<button
							class="size-btn"
							class:active={Math.abs(currentSize - preset.value) < 5}
							onclick={() => onSizeChange(preset.value)}
							title="{preset.label} ({preset.value}%)"
						>
							{preset.label}
						</button>
					{/each}
				</div>
			{/if}

			{#if onTileToggle}
				<button
					class="btn btn-icon btn-sm"
					class:preset-filled-primary-500={isTiled}
					class:preset-outlined-surface-500={!isTiled}
					onclick={onTileToggle}
					title="Tile watermark across image"
				>
					<iconify-icon icon="mdi:view-grid" width="18"></iconify-icon>
				</button>
			{/if}
		</div>

		<div class="divider hidden lg:block"></div>

		<!-- Group 4: Actions (Delete) -->
		<button class="btn btn-icon btn-sm preset-outlined-error-500" onclick={onDeleteWatermark} title="Delete Watermark (Delete)">
			<iconify-icon icon="mdi:delete" width="18"></iconify-icon>
		</button>
	{/if}

	<!-- Spacer -->
	<div class="flex-1 hidden lg:block"></div>

	<!-- Actions removed: Handled by global toolbar -->
	<div class="h-2"></div>
</div>

<style>
	.watermark-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
		width: 100%;
		padding: 0;
		background: transparent;
		border: none;
	}

	.control-group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.control-label {
		display: flex;
		gap: 0.25rem;
		align-items: center;
		font-size: 0.75rem;
		font-weight: 600;
		color: rgb(var(--color-surface-500) / 1);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}

	:global(.dark) .control-label {
		color: rgb(var(--color-surface-400) / 1);
	}

	.add-buttons {
		display: flex;
		gap: 0.5rem;
	}

	.position-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2px;
		padding: 2px;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 0.375rem;
	}

	.position-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		font-size: 0.875rem;
		color: #9ca3af;
		cursor: pointer;
		background: transparent;
		border: none;
		border-radius: 0.25rem;
		transition: all 0.15s;
	}

	.position-btn:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}

	/* Slider */
	.slider-wrapper {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		min-width: 160px;
		height: 2.25rem;
		padding: 0.25rem 0.75rem;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 9999px;
	}

	.slider-track-container {
		position: relative;
		display: flex;
		flex: 1;
		align-items: center;
		height: 100%;
	}

	.slider {
		position: absolute;
		width: 100%;
		height: 4px;
		margin: 0;
		-webkit-appearance: none;
		appearance: none;
		cursor: pointer;
		outline: none;
		background: rgb(var(--color-surface-300) / 1);
		border-radius: 2px;
	}

	:global(.dark) .slider {
		background: rgb(var(--color-surface-600) / 1);
	}

	.slider::-webkit-slider-thumb {
		width: 16px;
		height: 16px;
		margin-top: -6px;
		-webkit-appearance: none;
		appearance: none;
		cursor: pointer;
		background: white;
		border: 2px solid rgb(var(--color-primary-500) / 1);
		border-radius: 50%;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
		transition: transform 0.1s;
	}

	.slider-value {
		min-width: 2.5rem;
		font-family: monospace;
		font-size: 0.75rem;
		font-weight: 600;
		color: rgb(var(--color-primary-500) / 1);
		text-align: right;
	}

	.size-presets {
		display: flex;
		gap: 0.25rem;
	}

	.size-btn {
		min-width: 2rem;
		height: 2rem;
		padding: 0 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: rgb(var(--color-surface-700) / 1);
		cursor: pointer;
		background: rgb(var(--color-surface-50) / 1);
		border: 1px solid rgb(var(--color-surface-300) / 1);
		border-radius: 0.375rem;
		transition: all 0.15s;
	}

	:global(.dark) .size-btn {
		color: rgb(var(--color-surface-200) / 1);
		background: rgb(var(--color-surface-700) / 1);
		border-color: rgb(var(--color-surface-600) / 1);
	}

	.size-btn:hover {
		background: rgb(var(--color-surface-100) / 1);
		border-color: rgb(var(--color-primary-400) / 1);
	}

	:global(.dark) .size-btn:hover {
		background: rgb(var(--color-surface-600) / 1);
	}

	.size-btn.active {
		color: white;
		background: rgb(var(--color-primary-500) / 1);
		border-color: rgb(var(--color-primary-500) / 1);
	}

	.divider {
		flex-shrink: 0;
		width: 1px;
		height: 1.5rem;
		background: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .divider {
		background: rgb(var(--color-surface-600) / 1);
	}

	/* Mobile */
	@media (max-width: 1024px) {
		.watermark-controls {
			row-gap: 1rem;
		}
	}
</style>
