<!-- 
 @files src/routes/(app)/mediagallery/Filter.svelte
@component
**This component displays a filter for the media gallery**

```tsx
<Filter globalSearchValue={globalSearchValue} selectedMediaType={selectedMediaType} mediaTypes={mediaTypes} />
```
#### Props
- `globalSearchValue: string`: The current value of the global search input.
- `selectedMediaType: string`: The currently selected media type.
- `mediaTypes: { value: string; icon: string }[]`: An array of media type options.
-->

<script lang="ts">
	interface Props {
		globalSearchValue: string;
		selectedMediaType: string;
		mediaTypes: { value: string; icon: string }[];
	}

	let { globalSearchValue = $bindable(), selectedMediaType = $bindable(), mediaTypes }: Props = $props();

	function clearSearch() {
		globalSearchValue = '';
	}
</script>

<div class="mb-8 flex w-full flex-col justify-center gap-1 md:hidden">
	<label for="globalSearch">Search</label>
	<div class="input-group input-group-divider grid max-w-md grid-cols-[auto_1fr_auto]">
		<input id="globalSearch" type="text" placeholder="Search" class="input" bind:value={globalSearchValue} />
		{#if globalSearchValue}
			<button onclick={clearSearch} aria-label="Clear" class="preset-filled-surface-500 w-12">
				<iconify-icon icon="ic:outline-search-off" width="24"> </iconify-icon>
			</button>
		{/if}
	</div>

	<div class="mt-4 flex justify-between">
		<div class="flex flex-col">
			<label for="mediaType">Type</label>
			<select id="mediaType" bind:value={selectedMediaType} class="input">
				{#each mediaTypes as type}
					<option value={type.value}>
						<iconify-icon icon={type.icon} width="24" class="text-primary-500">
							<span class="uppercase">{type.value}</span>
						</iconify-icon>
					</option>
				{/each}
			</select>
		</div>

		<div class="flex flex-col text-center">
			<label for="sortButton">Sort</label>
			<button id="sortButton" class="preset-ghost-surface-500 btn" aria-label="Sort">
				<iconify-icon icon="flowbite:sort-outline" width="24"> </iconify-icon>
			</button>
		</div>
	</div>
</div>
