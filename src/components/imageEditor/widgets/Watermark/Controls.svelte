<!--
@file: src/components/imageEditor/toolbars/WatermarkControls.svelte
@component
Controls for the Watermark tool. Allows adding, deleting, and positioning watermarks.
-->
<script lang="ts">
	// Lucid icons
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import AlignStartVertical from '@lucide/svelte/icons/align-start-vertical';
	import AlignCenterVertical from '@lucide/svelte/icons/align-center-vertical';
	import AlignEndVertical from '@lucide/svelte/icons/align-end-vertical';
	import AlignStartHorizontal from '@lucide/svelte/icons/align-start-horizontal';
	import AlignCenterHorizontal from '@lucide/svelte/icons/align-center-horizontal';
	import AlignEndHorizontal from '@lucide/svelte/icons/align-end-horizontal';

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
		{ value: 'top-left', icon: AlignStartVertical },
		{ value: 'top-center', icon: AlignCenterVertical },
		{ value: 'top-right', icon: AlignEndVertical },
		{ value: 'center-left', icon: AlignStartHorizontal },
		{ value: 'center', icon: AlignCenterHorizontal },
		{ value: 'center-right', icon: AlignEndHorizontal },
		{ value: 'bottom-left', icon: AlignStartVertical },
		{ value: 'bottom-center', icon: AlignCenterVertical },
		{ value: 'bottom-right', icon: AlignEndVertical }
	];
</script>

<div class="flex w-full items-center gap-4">
	<button onclick={onAddWatermark} class="btn preset-outlined-surface-500">
		<Plus size={24} />
		<span>Add Watermark</span>
	</button>

	{#if hasSelection}
		<div class="h-6 w-px bg-surface-300 dark:bg-surface-600"></div>
		<span class="text-sm">Position:</span>
		<div class="btn-group preset-outlined-surface-500">
			{#each positions as pos}
				<button class="btn-sm" onclick={() => onPositionChange(pos.value)} title={pos.value}>
					<pos.icon />
				</button>
			{/each}
		</div>

		<div class="grow"></div>

		<button onclick={onDeleteWatermark} class="btn preset-outlined-error-500">
			<Trash2 size={24} />
			<span>Delete</span>
		</button>
	{/if}
</div>
