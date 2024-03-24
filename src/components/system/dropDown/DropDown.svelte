<script lang="ts">
	import { twMerge } from 'tailwind-merge';

	export let items: any;
	export let selected = items[0];
	export let label: string = '';
	export const modifier = (input) => input;
	export const icon: String | undefined = undefined;

	let expanded = false;
</script>

<div class="overflow-hidden {twMerge('bg-surface-500', $$props.class)}">
	<button on:click={() => (expanded = !expanded)} class="variant-filled-tertiary btn dark:variant-ghost-primary" class:selected={expanded}>
		{selected || label}
	</button>
</div>

<!-- Dropdown -->
{#if expanded}
	<div class="mb-3 border-b text-center text-tertiary-500 dark:text-primary-500">Choose your Widget</div>
	<div class="flex flex-wrap items-center justify-center gap-2">
		{#each items.filter((item) => item !== selected) as item}
			<button
				class="variant-filled-warning btn relative hover:variant-filled-secondary dark:variant-outline-warning"
				on:click={() => {
					selected = item;
					expanded = false;
				}}
			>
				<span class="text-surface-700 dark:text-white">{modifier(item)}</span>
			</button>
		{/each}
	</div>
{/if}
