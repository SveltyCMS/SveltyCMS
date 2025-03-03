<!-- 
@file src/components/VerticalList.svelte
@component
**VerticalList component for displaying items in a vertical list with drag-and-drop functionality**

```tsx
<VerticalList  items={items}  headers={headers} flipDurationMs={200} handleDndConsider={handleDndConsider} handleDndFinalize={handleDndFinalize}  children={children} />
```

### Props
- `items` {array} - Array of items to be displayed in the list
- `headers` {array} - Array of headers for the table columns
- `flipDurationMs` {number} - Duration of the flip animation in milliseconds
- `handleDndConsider` {function} - Function to handle drag-and-drop consider event
- `handleDndFinalize` {function} - Function to handle drag-and-drop finalize event
- `children` {function} - Function to render the content of the list
-->

<script lang="ts">
	import { dndzone } from 'svelte-dnd-action';
	import type { DndEvent } from 'svelte-dnd-action';

	interface Props {
		items: any;
		headers?: any[];
		flipDurationMs: number;
		handleDndConsider: (e: CustomEvent<DndEvent>) => void;
		handleDndFinalize: (e: CustomEvent<DndEvent>) => void;
		children?: import('svelte').Snippet;
	}

	let { items, headers = [], flipDurationMs, handleDndConsider, handleDndFinalize, children }: Props = $props();

	const gridClass = `grid grid-cols-${headers.length + 1} preset-ghost-tertiary dark:preset-ghost-primary w-full items-start justify-start p-1 py-2 pl-3 text-center font-semibold`;
</script>

<div class="h-full overflow-y-auto">
	<!-- Header -->
	{#if headers.length > 0}
		<div class={gridClass}>
			{#each headers as header}
				<div class="ml-2 text-left">{header}:</div>
			{/each}
		</div>
	{/if}

	<section use:dndzone={{ items: items, flipDurationMs }} onconsider={handleDndConsider} onfinalize={handleDndFinalize} class="my-1 w-full">
		<!-- Data -->
		{@render children?.()}
	</section>
</div>
