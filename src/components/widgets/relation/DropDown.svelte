<!--
@file src/components/widgets/relation/DropDown.svelte
@component
**Dropdown widget for relation field#**

```tsx
	<DropDown bind:dropDownData={dropDownData} bind:selected={selected} bind:field={field} bind:showDropDown={showDropDown} />
```
**Props:**
- `dropDownData` - {any[]} - Array of data to display in the dropdown
- `selected` - {any} - ASelected option
- `field` - {FieldType} - Field type  **(default: undefined)**
- `showDropDown` - {boolean} - Show dropdown **(default: true)**
-->

<script lang="ts">
	import type { FieldType } from '.';

	// Stores
	import { contentLanguage } from '@stores/store';
	import { collection, collectionValue } from '@root/src/stores/collectionStore.svelte';

	interface Props {
		dropDownData?: any[];
		selected?: { display: any; _id: any } | undefined;
		field: FieldType | undefined;
		showDropDown?: boolean;
	}

	let { dropDownData = [], selected = $bindable(undefined), field, showDropDown = $bindable(true) }: Props = $props();

	let search = $state('');
	let options: Array<{ display: any; _id: any }> = $state([]);

	// Use derived state for filtered options based on search and options
	let filtered = $derived(
		options.filter((item) => 
			String(item.display).toLowerCase().includes(search.toLowerCase())
		)
	);

	// Initialize options when dropDownData changes
	$effect: {
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
	}

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
				showDropDown = false;
			}}
			class="item text-token m-1 cursor-pointer border border-surface-400 bg-surface-400 p-1 text-center text-lg"
			role="option"
			aria-selected={selected?._id === option._id}
		>
			{@html option.display}
		</button>
	{/each}
</div>
