<!-- 
@file: src/routes/(app)/imageEditor/components/toolbars/WatermarkTopToolbar.svelte
@component
**Sticker tool top toolbar - compact overlay controls**
Provides a compact toolbar at the top of the canvas for sticker operations

#### Props
- `stickers`: Array of sticker data
- `selectedSticker`: Currently selected sticker
- `onAddSticker`: Function called when add sticker button is clicked
- `onDeleteSelected`: Function called when delete button is clicked
- `onBringToFront`: Function called when bring to front is clicked
- `onSendToBack`: Function called when send to back is clicked
- `onClose`: Function called when closing the toolbar
-->

<script lang="ts">
	interface StickerData {
		id: string;
		previewUrl: string;
	}

	interface Props {
		stickers: StickerData[];
		selectedSticker: StickerData | null;
		onAddSticker: () => void;
		onDeleteSelected: () => void;
		onBringToFront: () => void;
		onSendToBack: () => void;
		onReset: () => void;
		onDone: () => void;
	}

	let { stickers = [], selectedSticker = null, onAddSticker, onDeleteSelected, onBringToFront, onSendToBack, onReset, onDone }: Props = $props();
</script>

<div class="sticker-top-toolbar">
	<div class="toolbar-content">
		<!-- Left Section - Title -->
		<div class="toolbar-section">
			<iconify-icon icon="mdi:water" width="20" class="text-primary-500"></iconify-icon>
			<span class="toolbar-title">Watermark Tool</span>
			{#if stickers && stickers.length > 0}
				<span class="sticker-count">{stickers.length}</span>
			{/if}
		</div>

		<!-- Center Section - Actions -->
		<div class="toolbar-section toolbar-actions">
			<button onclick={onAddSticker} class="toolbar-btn toolbar-btn-primary" title="Add watermark" aria-label="Add watermark">
				<iconify-icon icon="mdi:plus" width="20"></iconify-icon>
				<span>Add Watermark</span>
			</button>

			{#if selectedSticker}
				<div class="divider"></div>

				<button onclick={onBringToFront} class="toolbar-btn" title="Bring to front" aria-label="Bring to front">
					<iconify-icon icon="mdi:arrow-up-bold" width="18"></iconify-icon>
					<span class="btn-label">Front</span>
				</button>

				<button onclick={onSendToBack} class="toolbar-btn" title="Send to back" aria-label="Send to back">
					<iconify-icon icon="mdi:arrow-down-bold" width="18"></iconify-icon>
					<span class="btn-label">Back</span>
				</button>

				<div class="divider"></div>

				<button onclick={onDeleteSelected} class="toolbar-btn toolbar-btn-danger" title="Delete watermark" aria-label="Delete watermark">
					<iconify-icon icon="mdi:delete" width="18"></iconify-icon>
					<span class="btn-label">Delete</span>
				</button>
			{/if}
		</div>

		<!-- Right Section - Reset & Done -->
		<div class="toolbar-section">
			{#if stickers && stickers.length > 0}
				<button onclick={onReset} class="toolbar-btn" title="Remove all watermarks" aria-label="Reset">
					<iconify-icon icon="mdi:refresh" width="20"></iconify-icon>
				</button>
			{/if}

			<button onclick={onDone} class="toolbar-btn toolbar-btn-done" title="Apply and close" aria-label="Done">
				<iconify-icon icon="mdi:check" width="20"></iconify-icon>
			</button>
		</div>
	</div>
</div>

<style>
	.sticker-top-toolbar {
		position: absolute;
		border-bottom-width: 1px;
		background-color: rgba(var(--color-surface-900) / 0.98);
		border-color: rgb(var(--color-surface-700) / 1);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
	}

	:global(.dark) .sticker-top-toolbar {
		background-color: rgba(var(--color-surface-900) / 0.98);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.toolbar-content {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-left: 1rem; padding-right: 1rem;
		padding-top: 0.75rem; padding-bottom: 0.75rem;
	}

	.toolbar-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.toolbar-actions {
		flex: 1 1 0%;
		justify-content: center;
		gap: 0.5rem;
	}

	.toolbar-title {
		font-size: 0.875rem; line-height: 1.25rem;
		font-weight: 600;
	}

	.sticker-count {
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		font-size: 0.75rem; line-height: 1rem;
		font-weight: 700;
		color: rgb(255 255 255);
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		border-radius: 0.5rem;
		padding-left: 0.75rem; padding-right: 0.75rem;
		font-size: 0.875rem; line-height: 1.25rem;
		font-weight: 500;
		/* @apply text-surface-100 hover:bg-surface-700 dark:text-surface-100 dark:hover:bg-surface-700; */
		/* @apply focus:outline-none focus:ring-2 focus:ring-primary-500; */
	}

	.toolbar-btn-primary {
		color: rgb(255 255 255);
	}

	.toolbar-btn-danger {
		/* @apply text-error-600 hover:bg-error-100 dark:text-error-400 dark:hover:bg-error-900/30; */
	}

	.toolbar-btn-done {
		color: rgb(255 255 255);
	}

	.btn-label {
		display: none;
	}

	.divider {
		/* @apply h-6 w-px bg-surface-300 dark:bg-surface-600; */
	}

	/* Mobile adjustments */
	@media (max-width: 640px) {
		.toolbar-content {
			padding-left: 0.5rem; padding-right: 0.5rem;
			padding-top: 0.5rem; padding-bottom: 0.5rem;
		}

		.toolbar-btn {
			padding-left: 0.5rem; padding-right: 0.5rem;
		}

		.toolbar-title {
			display: none;
		}
	}
</style>
