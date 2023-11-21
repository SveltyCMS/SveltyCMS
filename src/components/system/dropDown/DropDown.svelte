<script lang="ts">
	export let items: any;
	export let selected = items[0];
	export let label: string = '';

	let expanded = false;
</script>

<div class="overflow-hidden">
	<div class="mb-4 text-center">
		{#if !expanded}
			<p class="text-primary-500">Click to Select a widget</p>
		{/if}

		<button on:click={() => (expanded = !expanded)} class="variant-ghost-primary btn" class:selected={expanded}>{selected || label}</button>
	</div>

	<!-- dropdown -->
	{#if expanded}
		<div class="mb-3 border-b text-center text-primary-500">Choose your Widget</div>
		<div class="flex flex-wrap items-center justify-center gap-2">
			{#each items.filter((item) => item !== selected) as item}
				<button
					class="variant-outline-warning btn relative hover:variant-filled-secondary"
					on:click={() => {
						selected = item;
						expanded = false;
					}}
				>
					{item}
				</button>
			{/each}
		</div>
	{/if}
</div>
