<!-- 
 @file src/routes/(app)/mediagallery/filter.svelte
@component
**This component displays a filter for the media gallery**

```tsx
<filter globalSearchValue={globalSearchValue} selectedMediaType={selectedMediaType} mediaTypes={mediaTypes} />
```
#### Props
- `globalSearchValue: string`: The current value of the global search input.
- `selectedMediaType: string`: The currently selected media type.
- `mediaTypes: { value: string; icon: string }[]`: An array of media type options.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';

interface Props {
	globalSearchValue: string;
	mediaTypes: { value: string; icon: string }[];
	selectedMediaType: string;
}

let {
	globalSearchValue = $bindable(),
	selectedMediaType = $bindable(),
	mediaTypes,
}: Props = $props();

const mediaTypeOptions = $derived(
	mediaTypes.map((type) => ({
		value: type.value,
		label: type.value.toUpperCase(),
	})),
);

function clearSearch() {
	globalSearchValue = "";
}
</script>

<div class="mb-8 flex w-full flex-col justify-center gap-4 md:hidden">
	<div class="flex max-w-md items-end gap-2">
		<Input
			id="globalSearch"
			bind:value={globalSearchValue}
			label="Search"
			placeholder="Search"
			class="flex-1"
		/>
		{#if globalSearchValue}
			<Button variant="surface" onclick={clearSearch} aria-label="Clear search" class="w-12">
				<iconify-icon icon="ic:outline-search-off" width={24}></iconify-icon>
			</Button>
		{/if}
	</div>

	<div class="mt-2 flex justify-between gap-4">
		<Select
			bind:value={selectedMediaType}
			label="Type"
			options={mediaTypeOptions}
			placeholder="Type"
			class="flex-1"
		/>

		<div class="flex flex-col justify-end text-center">
			<span class="mb-2 text-sm font-medium">Sort</span>
			<Button variant="outline" id="sortButton" aria-label="Sort">
				<iconify-icon icon="flowbite:sort-outline" width={24}></iconify-icon>
			</Button>
		</div>
	</div>
</div>