<!-- 
@files src/routes/(app)/config/collection/Unassigned.svelte
@component
**This component displays a list of unassigned collections**

### Props
- `items` {any[]} - Array of unassigned collection items
- `onDrop` {Function} - Callback function to handle drop events

### Features
- Drag and drop support for reassigning collections
-->
<script lang="ts">
	//ParaglideJS
	import * as m from '$paraglide/messages.js';

	// Svelte DND-actions
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';
	const flipDurationMs = 200;

	interface Props {
		items: any;
		onDrop: any;
	}

	let { items = $bindable(), onDrop }: Props = $props();

	function handleDndConsiderCards(e: any) {
		items = e.detail.items;
	}

	function handleDndFinalizeCards(e: any) {
		onDrop(e.detail.items);
	}
</script>

<div class="ml-1 rounded-sm border-2 border-tertiary-500">
	<h2 class="mb-2 text-center font-bold dark:text-white">{m.Unassigned_Collections()}</h2>
	<div
		class="flex w-full flex-wrap overflow-x-auto p-2"
		use:dndzone={{ items: items, flipDurationMs }}
		onconsider={handleDndConsiderCards}
		onfinalize={handleDndFinalizeCards}
	>
		{#each items as item (item.id)}
			<div
				class="mx-2 my-1 flex h-10 w-5/12 items-center justify-between overflow-x-auto rounded-sm border border-surface-700 bg-surface-300 text-center text-xs font-bold hover:bg-surface-400 dark:text-white"
				animate:flip={{ duration: flipDurationMs }}
			>
				<iconify-icon icon="mdi:drag" width="18" class="pl-0.5"></iconify-icon>

				<span class="break-word flex items-center gap-2">
					<iconify-icon icon={item.icon} width="18" class="text-error-500"></iconify-icon>
					{item.name}</span
				>

				<a
					href={`/collection/${item.name}/edit`}
					aria-label="Edit {item.name}"
					class="text-black hover:text-primary-500"
					data-sveltekit-preload-data="hover"
				>
					<iconify-icon icon="mdi:pen" width="18" class="pr-0.5"></iconify-icon>
				</a>
			</div>
		{/each}
	</div>
</div>
