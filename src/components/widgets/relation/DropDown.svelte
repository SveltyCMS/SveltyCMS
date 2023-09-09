<script lang="ts">
	import type { FieldType } from '.';
	import { contentLanguage, entryData } from '@src/stores/store';
	export let dropDownData: any[] = [];

	export let selected: { display: any; _id: any } | undefined = undefined;
	export let field: FieldType | undefined;
	export let showDropDown = true;

	let search = '';
	let options: Array<{ display: any; _id: any }> = [];
	let filtered = options;
	//console.log(dropDownData);
	Promise.all(
		dropDownData.map(async (item) => ({
			display: await field?.display(item, field, $entryData, $contentLanguage),
			_id: item._id
		}))
	).then((res) => (options = res));
	$: filtered = options.filter((item) => item.display.includes(search));
</script>

<input class="input w-full" placeholder="search..." bind:value={search} />
<div class="overflow-auto">
	{#each filtered as option}
		<button
			on:keydown
			on:click={() => {
				selected = option;
				showDropDown = false;
			}}
			class="item"
		>
			{option.display}
		</button>
	{/each}
</div>

<style lang="postcss">
	.item {
		cursor: pointer;
		user-select: none;
		margin: 5px;
		font-size: 20px;
		color: black;
		padding: 5px;
		border: 1px solid #8cccff;
		border-radius: 12px;
		background-color: #8cccff;
		text-align: center;
	}
</style>
