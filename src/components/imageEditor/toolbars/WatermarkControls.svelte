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
		hasSelection
	}: {
		onAddWatermark: () => void;
		onDeleteWatermark: () => void;
		onPositionChange: (position: string) => void;
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

<div class="flex w-full items-center gap-4">
	<button onclick={onAddWatermark} class="btn preset-ghost-surface-500">
		<iconify-icon icon="mdi:plus-box-outline"></iconify-icon>
		<span>Add Watermark</span>
	</button>

	{#if hasSelection}
		<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>
		<span class="text-sm">Position:</span>
		<div class=" preset-ghost-surface-500">
			{#each positions as pos}
				<button class="btn btn-sm" onclick={() => onPositionChange(pos.value)} title={pos.value}>
					<iconify-icon icon={pos.icon}></iconify-icon>
				</button>
			{/each}
		</div>

		<div class="grow"></div>

		<button onclick={onDeleteWatermark} class="btn preset-ghost-error-500">
			<iconify-icon icon="mdi:delete-outline"></iconify-icon>
			<span>Delete</span>
		</button>
	{/if}
</div>
