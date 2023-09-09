<script lang="ts">
	export let items: any;
	export let selected = items[0];
	export let label: string = '';

	let expanded = false;
</script>

<div class="container">
	<button on:click={() => (expanded = !expanded)} class:selected={expanded}
		>{selected || label}</button
	>
	{#if expanded}
		<div class="items">
			{#each items.filter((item) => item !== selected) as item}
				<button
					class="item"
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

<style lang="postcss">
	.container {
		border-radius: 5px;
		overflow: hidden;
	}
	.selected {
		border-bottom: 1px solid white;
	}
	button {
		position: relative;
		background-color: gray;
		padding: 5px 40px;
		color: white;
		text-align: center;
		user-select: none;
		cursor: pointer;
	}
	.item:hover {
		background-color: aqua;
	}
	.item {
		border-bottom: 1px solid rgb(153, 153, 153);
	}
</style>
