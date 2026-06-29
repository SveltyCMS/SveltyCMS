<!--
@file src/components/image-editor/widgets/watermark/controls-mobile.svelte
@component
Mobile watermark controls — action/size strips + position grid; opacity slider in editor-mobile-panel.
-->
<script lang="ts">
	let {
		onAddImage,
		onAddText,
		onDeleteWatermark,
		onPositionChange,
		onSizeChange,
		onTileToggle,
		hasSelection = false,
		currentPosition = 'center',
		currentSize = 100,
		isTiled = false,
		watermarkCount = 0
	}: {
		onAddImage: () => void;
		onAddText?: () => void;
		onDeleteWatermark: () => void;
		onPositionChange: (position: string) => void;
		onSizeChange?: (size: number) => void;
		onTileToggle?: () => void;
		hasSelection?: boolean;
		currentPosition?: string;
		currentSize?: number;
		isTiled?: boolean;
		watermarkCount?: number;
	} = $props();

	const positions = [
		{ label: '↖', value: 'northwest', title: 'Top left' },
		{ label: '↑', value: 'north', title: 'Top center' },
		{ label: '↗', value: 'northeast', title: 'Top right' },
		{ label: '←', value: 'west', title: 'Middle left' },
		{ label: '●', value: 'center', title: 'Center' },
		{ label: '→', value: 'east', title: 'Middle right' },
		{ label: '↙', value: 'southwest', title: 'Bottom left' },
		{ label: '↓', value: 'south', title: 'Bottom center' },
		{ label: '↘', value: 'southeast', title: 'Bottom right' }
	] as const;

	const sizePresets = [
		{ label: 'XS', value: 50 },
		{ label: 'S', value: 75 },
		{ label: 'M', value: 100 },
		{ label: 'L', value: 150 },
		{ label: 'XL', value: 200 }
	] as const;

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

	function isSizeActive(value: number): boolean {
		return Math.abs(currentSize - value) < 5;
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="watermark-controls-mobile" role="toolbar" aria-label="Watermark controls">
	<div class="watermark-mobile-strip" role="group" aria-label="Watermark actions">
		<button type="button" class="watermark-mobile-pill" onclick={onAddImage} aria-label="Add image watermark">
			<iconify-icon icon="mdi:image-plus" width="14" aria-hidden="true"></iconify-icon>
			<span>Image</span>
		</button>

		{#if onAddText}
			<button type="button" class="watermark-mobile-pill" onclick={onAddText} aria-label="Add text watermark">
				<iconify-icon icon="mdi:text-box-plus" width="14" aria-hidden="true"></iconify-icon>
				<span>Text{watermarkCount > 0 ? ` (${watermarkCount})` : ''}</span>
			</button>
		{/if}

		<button
			type="button"
			class="watermark-mobile-pill"
			class:watermark-mobile-pill-disabled={!hasSelection}
			onclick={onDeleteWatermark}
			disabled={!hasSelection}
			aria-label="Delete watermark"
		>
			Delete
		</button>

		{#if hasSelection && onTileToggle}
			<button
				type="button"
				class="watermark-mobile-pill"
				class:watermark-mobile-pill-active={isTiled}
				onclick={onTileToggle}
				aria-label="Tile watermark across image"
				aria-pressed={isTiled}
			>
				<iconify-icon icon="mdi:view-grid" width="14" aria-hidden="true"></iconify-icon>
				<span>Tile</span>
			</button>
		{/if}
	</div>

	{#if hasSelection && onSizeChange}
		<div class="watermark-mobile-strip" role="group" aria-label="Watermark size">
			<span class="watermark-mobile-group-label" aria-hidden="true">Size</span>
			{#each sizePresets as preset (preset.value)}
				<button
					type="button"
					class="watermark-mobile-pill watermark-mobile-size-pill"
					class:watermark-mobile-pill-active={isSizeActive(preset.value)}
					onclick={() => onSizeChange(preset.value)}
					aria-label="Size {preset.label}"
					aria-pressed={isSizeActive(preset.value)}
				>
					{preset.label}
				</button>
			{/each}
		</div>
	{/if}

	{#if hasSelection}
		<div class="watermark-mobile-position-wrap" role="group" aria-label="Watermark position">
			<span class="watermark-mobile-group-label watermark-mobile-position-label" aria-hidden="true">Position</span>
			<div class="watermark-mobile-position-grid">
				{#each positions as pos (pos.value)}
					<button
						type="button"
						class="watermark-mobile-position-btn"
						class:watermark-mobile-position-btn-active={currentPosition === pos.value}
						onclick={() => onPositionChange(pos.value)}
						title={pos.title}
						aria-label={pos.title}
						aria-pressed={currentPosition === pos.value}
					>
						{pos.label}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.watermark-controls-mobile {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		align-items: center;
		width: 100%;
		min-width: 0;
	}

	.watermark-mobile-strip {
		display: inline-flex;
		flex-wrap: nowrap;
		gap: 0.125rem;
		align-items: center;
		width: fit-content;
		max-width: 100%;
		padding: 0.125rem;
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

	.watermark-mobile-strip::-webkit-scrollbar {
		display: none;
	}

	.watermark-mobile-group-label {
		flex: 0 0 auto;
		padding-inline: 0.3125rem 0.125rem;
		font-size: 0.5625rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.42);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		white-space: nowrap;
	}

	.watermark-mobile-pill {
		display: inline-flex;
		flex: 0 0 auto;
		gap: 0.25rem;
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

	.watermark-mobile-size-pill {
		min-width: 1.875rem;
		padding-inline: 0.4375rem;
	}

	.watermark-mobile-pill:active:not(:disabled) {
		transform: scale(0.96);
	}

	.watermark-mobile-pill-active {
		color: #141414;
		background: rgba(255, 255, 255, 0.94);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14);
	}

	.watermark-mobile-pill-disabled,
	.watermark-mobile-pill:disabled {
		cursor: not-allowed;
		opacity: 0.38;
	}

	.watermark-mobile-position-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.3125rem;
		align-items: center;
		width: 100%;
	}

	.watermark-mobile-position-label {
		padding-inline: 0;
	}

	.watermark-mobile-position-grid {
		display: grid;
		grid-template-columns: repeat(3, 1.875rem);
		gap: 0.1875rem;
		padding: 0.1875rem;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 0.75rem;
		backdrop-filter: blur(10px);
	}

	.watermark-mobile-position-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.875rem;
		height: 1.875rem;
		padding: 0;
		font-size: 0.8125rem;
		line-height: 1;
		color: rgba(255, 255, 255, 0.78);
		cursor: pointer;
		background: rgba(255, 255, 255, 0.04);
		border: none;
		border-radius: 0.4375rem;
		transition:
			background 0.15s ease,
			color 0.15s ease,
			transform 0.1s ease;
	}

	.watermark-mobile-position-btn:active {
		transform: scale(0.94);
	}

	.watermark-mobile-position-btn-active {
		color: #141414;
		background: rgba(255, 255, 255, 0.94);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
	}
</style>
