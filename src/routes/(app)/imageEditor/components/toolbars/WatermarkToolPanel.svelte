<!-- 
@file: /src/routes/(app)/imageEditor/StickerToolPanel.svelte
@component
**Sticker tool panel UI - controls for adding and managing stickers**
Provides the interface for uploading, selecting, and managing stickers

#### Props
- `stickers`: Array of sticker data
- `selectedSticker`: Currently selected sticker
- `onAddSticker`: Function called when add sticker button is clicked
- `onSelectSticker`: Function called when a sticker is selected
- `onDeleteSelected`: Function called when delete button is clicked
- `onDeleteAll`: Function called when delete all button is clicked
- `onBringToFront`: Function called when bring to front is clicked
- `onSendToBack`: Function called when send to back is clicked
- `onClose`: Function called when closing the panel
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
		onSelectSticker: (sticker: StickerData) => void;
		onDeleteSelected: () => void;
		onDeleteAll: () => void;
		onBringToFront: () => void;
		onSendToBack: () => void;
		onClose: () => void;
	}

	let { stickers, selectedSticker, onAddSticker, onSelectSticker, onDeleteSelected, onDeleteAll, onBringToFront, onSendToBack, onClose }: Props =
		$props();
</script>

<div class="sticker-panel">
	<div class="panel-header">
		<div class="panel-title">
			<h3 class="text-lg font-semibold text-surface-700 dark:text-surface-200">Sticker Tool</h3>
			<p class="text-sm text-surface-500 dark:text-surface-400">Add image overlays to your photo</p>
		</div>
		<button onclick={onClose} class="variant-ghost btn-icon" aria-label="Close sticker panel" title="Close panel">
			<iconify-icon icon="mdi:close" width="20"></iconify-icon>
		</button>
	</div>

	<div class="panel-content">
		<!-- Add sticker button -->
		<button onclick={onAddSticker} class="variant-filled-primary btn w-full" aria-label="Add new sticker">
			<iconify-icon icon="mdi:sticker-plus" width="20"></iconify-icon>
			<span>Add Sticker</span>
		</button>

		{#if stickers.length > 0}
			<div class="sticker-list">
				<h4 class="list-title">Added Stickers ({stickers.length})</h4>

				<div class="sticker-grid">
					{#each stickers as sticker (sticker.id)}
						<button
							class="sticker-item"
							class:selected={selectedSticker?.id === sticker.id}
							onclick={() => onSelectSticker(sticker)}
							aria-label="Select sticker"
						>
							<img src={sticker.previewUrl} alt="Sticker preview" class="sticker-img" />
							{#if selectedSticker?.id === sticker.id}
								<div class="selected-badge">
									<iconify-icon icon="mdi:check-circle" width="16"></iconify-icon>
								</div>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<!-- Controls for selected sticker -->
			{#if selectedSticker}
				<div class="sticker-controls">
					<h4 class="controls-title">Selected Sticker</h4>

					<div class="control-buttons">
						<button onclick={onBringToFront} class="variant-outline btn btn-sm" aria-label="Bring to front">
							<iconify-icon icon="mdi:arrow-up-bold" width="16"></iconify-icon>
							<span>Front</span>
						</button>

						<button onclick={onSendToBack} class="variant-outline btn btn-sm" aria-label="Send to back">
							<iconify-icon icon="mdi:arrow-down-bold" width="16"></iconify-icon>
							<span>Back</span>
						</button>

						<button onclick={onDeleteSelected} class="variant-filled-error btn btn-sm" aria-label="Delete selected sticker">
							<iconify-icon icon="mdi:delete" width="16"></iconify-icon>
							<span>Delete</span>
						</button>
					</div>

					<div class="help-text">
						<iconify-icon icon="mdi:information" width="14"></iconify-icon>
						<span class="text-xs">Drag to move • Handles to resize/rotate</span>
					</div>
				</div>
			{/if}

			<!-- Delete all button -->
			<button onclick={onDeleteAll} class="variant-outline-error btn mt-2 w-full" aria-label="Delete all stickers">
				<iconify-icon icon="mdi:delete-sweep" width="20"></iconify-icon>
				<span>Remove All Stickers</span>
			</button>
		{:else}
			<div class="empty-state">
				<iconify-icon icon="mdi:sticker-emoji" width="48" class="text-surface-400"></iconify-icon>
				<p class="text-sm text-surface-500 dark:text-surface-400">No stickers added yet. Click "Add Sticker" to get started!</p>
			</div>
		{/if}

		<!-- Tips section -->
		<div class="tips-section">
			<h4 class="tips-title">
				<iconify-icon icon="mdi:lightbulb" width="16" class="text-warning-500"></iconify-icon>
				Tips
			</h4>
			<ul class="tips-list">
				<li class="tip-item">
					<iconify-icon icon="mdi:circle-small" width="16" class="text-surface-400"></iconify-icon>
					<span class="text-sm">Click sticker to select and edit</span>
				</li>
				<li class="tip-item">
					<iconify-icon icon="mdi:circle-small" width="16" class="text-surface-400"></iconify-icon>
					<span class="text-sm">Drag corners to resize proportionally</span>
				</li>
				<li class="tip-item">
					<iconify-icon icon="mdi:circle-small" width="16" class="text-surface-400"></iconify-icon>
					<span class="text-sm">Use top handle to rotate</span>
				</li>
				<li class="tip-item">
					<iconify-icon icon="mdi:circle-small" width="16" class="text-surface-400"></iconify-icon>
					<span class="text-sm">Add multiple stickers and layer them</span>
				</li>
			</ul>
		</div>
	</div>
</div>

<style>
	.sticker-panel {
		@apply flex w-80 flex-col border-l;
		background-color: rgb(var(--color-surface-50) / 1);
		border-color: rgb(var(--color-surface-200) / 1);
		min-height: 100%;
	}

	:global(.dark) .sticker-panel {
		background-color: rgb(var(--color-surface-800) / 1);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.panel-header {
		@apply flex items-center justify-between border-b p-4;
		border-color: rgb(var(--color-surface-200) / 1);
	}

	:global(.dark) .panel-header {
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.panel-title {
		@apply flex flex-1 flex-col gap-1;
	}

	.panel-content {
		@apply flex flex-1 flex-col gap-4 overflow-y-auto p-4;
	}

	.sticker-list {
		@apply flex flex-col gap-2;
	}

	.list-title {
		@apply text-sm font-semibold text-surface-700 dark:text-surface-300;
	}

	.sticker-grid {
		@apply grid grid-cols-4 gap-2;
	}

	.sticker-item {
		@apply relative aspect-square overflow-hidden rounded-lg border-2 transition-all;
		@apply border-surface-300 bg-surface-100 dark:border-surface-600 dark:bg-surface-800;
		@apply hover:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500;
	}

	.sticker-item.selected {
		@apply border-primary-500 ring-2 ring-primary-500 ring-offset-2;
	}

	.sticker-img {
		@apply h-full w-full object-contain p-1;
	}

	.selected-badge {
		@apply absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-white;
	}

	.sticker-controls {
		@apply flex flex-col gap-3 rounded-lg border p-3;
		@apply border-surface-300 bg-surface-50 dark:border-surface-600 dark:bg-surface-800;
	}

	.controls-title {
		@apply text-sm font-semibold text-surface-700 dark:text-surface-300;
	}

	.control-buttons {
		@apply flex gap-2;
	}

	.help-text {
		@apply flex items-center gap-2 text-surface-600 dark:text-surface-400;
	}

	.empty-state {
		@apply flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8;
		@apply border-surface-300 bg-surface-50 dark:border-surface-600 dark:bg-surface-800;
	}

	.tips-section {
		@apply mt-auto flex flex-col gap-2 rounded-lg border p-3;
		@apply border-surface-200 bg-surface-100 dark:border-surface-700 dark:bg-surface-800;
	}

	.tips-title {
		@apply flex items-center gap-2 text-sm font-semibold text-surface-700 dark:text-surface-300;
	}

	.tips-list {
		@apply flex flex-col gap-1;
	}

	.tip-item {
		@apply flex items-start gap-1 text-surface-600 dark:text-surface-300;
	}
</style>
