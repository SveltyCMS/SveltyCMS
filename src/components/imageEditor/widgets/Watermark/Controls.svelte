<!--
@file: src/components/imageEditor/toolbars/WatermarkControls.svelte
@component
Controls for the Watermark tool. Allows adding, deleting, and positioning watermarks.
-->
<script lang="ts">
	let {
		onAddWatermark,
		onDeleteWatermark,
		onPositionChange,
		onCancel,
		onApply,
		hasSelection
	}: {
		onAddWatermark: () => void;
		onDeleteWatermark: () => void;
		onPositionChange: (position: string) => void;
		onCancel: () => void;
		onApply: () => void;
		hasSelection: boolean;
	} = $props();

	const positions = [
		{ value: 'top-left', icon: 'mdi:align-vertical-top' },
		{ value: 'top-center', icon: 'mdi:align-vertical-center' },
		{ value: 'top-right', icon: 'mdi:align-vertical-top' },
		{ value: 'center-left', icon: 'mdi:align-horizontal-left' },
		{ value: 'center', icon: 'mdi:align-horizontal-center' },
		{ value: 'center-right', icon: 'mdi:align-horizontal-right' },
		{ value: 'bottom-left', icon: 'mdi:align-vertical-bottom' },
		{ value: 'bottom-center', icon: 'mdi:align-vertical-center' },
		{ value: 'bottom-right', icon: 'mdi:align-vertical-bottom' }
	];
</script>

<div class="flex w-full items-center gap-4 flex-wrap">
	<button onclick={onAddWatermark} class="btn preset-outlined-surface-500">
		<iconify-icon icon="mdi:plus-box-outline" width={24}></iconify-icon>
		<span class="hidden sm:inline">Add Watermark</span>
	</button>

	{#if hasSelection}
		<div class="h-6 w-px bg-surface-300 dark:bg-surface-600 hidden sm:block"></div>
		<span class="text-sm hidden md:inline">Position:</span>
		<div class="btn-group preset-outlined-surface-500">
			{#each positions as pos}
				<button class="btn-sm" onclick={() => onPositionChange(pos.value)} title={pos.value}>
					<iconify-icon icon={pos.icon} width="18"></iconify-icon>
				</button>
			{/each}
		</div>

		<button onclick={onDeleteWatermark} class="btn preset-outlined-surface-500">
			<iconify-icon icon="mdi:delete-outline" width={24}></iconify-icon>
			<span class="hidden sm:inline">Delete</span>
		</button>
	{/if}

	<div class="grow"></div>

	<!-- Action Buttons -->
	<div class="flex items-center gap-2 shrink-0">
		<button class="btn preset-outlined-error-500" onclick={onCancel}>
			<iconify-icon icon="mdi:close" width="18"></iconify-icon>
			<span class="hidden sm:inline">Cancel</span>
		</button>
		<button class="btn preset-filled-success-500" onclick={onApply}>
			<iconify-icon icon="mdi:check" width="18"></iconify-icon>
			<span class="hidden sm:inline">Done</span>
		</button>
	</div>
</div>
