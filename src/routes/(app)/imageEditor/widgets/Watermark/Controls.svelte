<!--
@file src/routes/(app)/imageEditor/components/toolbars/controls/WatermarkControls.svelte
@component
**Watermark tool controls for master toolbar**

### Props
- `stickerCount`: Number of stickers currently added
- `hasSelection`: Boolean indicating if a sticker is currently selected
- `onAddSticker`: Function called when Add Watermark button is clicked
- `onDeleteSelected`: Function called when Delete button is clicked
- `onDeleteAll`: Function called when Clear All button is clicked
- `onApply`: Function called when Done button is clicked
### Features:
- Button to add new watermark stickers
- Displays count of current stickers
- Button to delete selected sticker (if any)
- Button to clear all stickers
- Done button to apply changes
-->

<script lang="ts">
	let {
		stickerCount,
		hasSelection,
		onAddSticker,
		onDeleteSelected,
		onDeleteAll,
		onApply
	}: {
		stickerCount: number;
		hasSelection: boolean;
		onAddSticker: () => void;
		onDeleteSelected: () => void;
		onDeleteAll: () => void;
		onApply: () => void;
	} = $props();
</script>

<div class="watermark-controls">
	<button onclick={onAddSticker} class="control-btn primary">
		<iconify-icon icon="mdi:plus" width="18"></iconify-icon>
		Add Watermark
	</button>

	{#if stickerCount > 0}
		<div class="divider"></div>

		<span class="count-badge">{stickerCount} item{stickerCount !== 1 ? 's' : ''}</span>

		{#if hasSelection}
			<button onclick={onDeleteSelected} class="control-btn danger">
				<iconify-icon icon="mdi:delete" width="18"></iconify-icon>
				Delete
			</button>
		{/if}

		<button onclick={onDeleteAll} class="control-btn">
			<iconify-icon icon="mdi:delete-sweep" width="18"></iconify-icon>
			Clear All
		</button>

		<div class="divider"></div>

		<button onclick={onApply} class="apply-btn">
			<iconify-icon icon="mdi:check" width="18"></iconify-icon>
			Done
		</button>
	{/if}
</div>

<style lang="postcss">
	.watermark-controls {
		@apply flex items-center gap-2;
	}

	.control-btn {
		@apply flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors;
		background-color: rgb(var(--color-surface-200) / 1);
		color: rgb(var(--color-surface-700) / 1);
	}

	:global(.dark) .control-btn {
		background-color: rgb(var(--color-surface-700) / 1);
		color: rgb(var(--color-surface-200) / 1);
	}

	.control-btn:hover {
		background-color: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .control-btn:hover {
		background-color: rgb(var(--color-surface-600) / 1);
	}

	.control-btn.primary {
		background-color: rgb(var(--color-primary-500) / 1);
		color: white;
	}

	.control-btn.primary:hover {
		background-color: rgb(var(--color-primary-600) / 1);
	}

	.control-btn.danger {
		background-color: rgb(var(--color-error-500) / 1);
		color: white;
	}

	.control-btn.danger:hover {
		background-color: rgb(var(--color-error-600) / 1);
	}

	.count-badge {
		@apply rounded-full px-2.5 py-1 text-xs font-semibold;
		background-color: rgb(var(--color-surface-300) / 1);
		color: rgb(var(--color-surface-700) / 1);
	}

	:global(.dark) .count-badge {
		background-color: rgb(var(--color-surface-600) / 1);
		color: rgb(var(--color-surface-200) / 1);
	}

	.apply-btn {
		@apply flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium;
		background-color: rgb(var(--color-success-500) / 1);
		color: white;
	}

	.apply-btn:hover {
		background-color: rgb(var(--color-success-600) / 1);
	}

	.divider {
		@apply h-6 w-px;
		background-color: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .divider {
		background-color: rgb(var(--color-surface-600) / 1);
	}
</style>
