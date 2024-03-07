<script lang="ts">
	import type { FieldType } from '.';

	// Stores
	import { contentLanguage, collection, entryData } from '@stores/store';

	export let dropDownData: any[] = [];
	export let selected: { display: any; _id: any } | undefined = undefined;
	export let field: FieldType | undefined;
	export let showDropDown = true;

	let search = '';
	let options: Array<{ display: any; _id: any }> = [];
	let filtered = options;

	console.log(dropDownData);

	$: Promise.all(
		dropDownData.map(async (item) => ({
			display: await field?.display({ data: item, collection: $collection, field, entry: $entryData, contentLanguage: $contentLanguage }),
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
			class="item text-token m-1 cursor-pointer border border-surface-400 bg-surface-400 p-1 text-center text-lg"
		>
			{@html option.display}
		</button>
	{/each}
</div>
