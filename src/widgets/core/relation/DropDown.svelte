<!--
@file src/widgets/core/relation/DropDown.svelte
@component
**Dropdown widget for relation field#**

@example
<DropDown label="Dropdown" db_fieldName="dropdown" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import type { FieldType } from '.';

	// Stores
	import { contentLanguage } from '@stores/store.svelte';
	import { collection, collectionValue } from '@src/stores/collectionStore.svelte';

	interface Props {
		dropDownData?: any[];
		selected?: { display: any; _id: any } | undefined;
		showDropDown?: boolean;
		field: FieldType | undefined;
	}

	let { dropDownData = [], selected = $bindable(undefined), showDropDown = $bindable(false), field }: Props = $props();

	let search = $state('');
	let options: Array<{ display: any; _id: any }> = $state([]);

	// Use $derived for filtered options based on search
	let filtered = $derived(options.filter((item) => String(item.display).toLowerCase().includes(search.toLowerCase())));

	// Use $effect to initialize options when dropDownData changes
	$effect(() => {
		const initializeOptions = async () => {
			const res = await Promise.all(
				dropDownData.map(async (item) => ({
					display: await field?.display({
						data: item,
						collection: collection.value,
						field,
						entry: collectionValue.value,
						contentLanguage: $contentLanguage
					}),
					_id: item._id
				}))
			);
			options = res;
		};

		initializeOptions();
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			const target = event.target as HTMLButtonElement;
			target.click();
		}
	}
</script>

<input class="input w-full" placeholder="search..." bind:value={search} type="search" aria-label="Search options" />

<div class="overflow-auto" role="listbox">
	{#each filtered as option}
		<button
			onkeydown={handleKeydown}
			onclick={() => {
				selected = option;
				showDropDown = false; // Close dropdown when item is selected
			}}
			class="item text-token m-1 cursor-pointer border border-surface-400 bg-surface-400 p-1 text-center text-lg"
			role="option"
			aria-selected={selected?._id === option._id}
		>
			{@html option.display}
		</button>
	{/each}
</div>
