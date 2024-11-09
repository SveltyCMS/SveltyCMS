<script lang="ts">
	import { run, createBubbler } from 'svelte/legacy';

	const bubble = createBubbler();
	import type { FieldType } from '.';

	// Stores
	import { contentLanguage } from '@stores/store';
	import { collection, collectionValue } from '@stores/collectionStore';

	interface Props {
		dropDownData?: any[];
		selected?: { display: any; _id: any } | undefined;
		field: FieldType | undefined;
		showDropDown?: boolean;
	}

	let {
		dropDownData = [],
		selected = $bindable(undefined),
		field,
		showDropDown = $bindable(true)
	}: Props = $props();

	let search = $state('');
	let options: Array<{ display: any; _id: any }> = $state([]);
	let filtered = $state(options);

	console.log(dropDownData);

	run(() => {
		Promise.all(
			dropDownData.map(async (item) => ({
				display: await field?.display({ data: item, collection: $collection, field, entry: $collectionValue, contentLanguage: $contentLanguage }),
				_id: item._id
			}))
		).then((res) => (options = res));
	});

	run(() => {
		filtered = options.filter((item) => item.display.includes(search));
	});
</script>

<input class="input w-full" placeholder="search..." bind:value={search} />

<div class="overflow-auto">
	{#each filtered as option}
		<button
			onkeydown={bubble('keydown')}
			onclick={() => {
				selected = option;
				showDropDown = false;
			}}
			class="item text-token m-1 cursor-pointer border border-surface-400 bg-surface-400 p-1 text-center text-lg"
		>
			{@html option.display}
		</button>
	{/each}
</div>
