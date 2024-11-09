<!-- 
 @files src/routes/(app)/mediagallery/Filter.svelte
@description This component displays a filter for the media gallery.
-->
<script lang="ts">
	export let globalSearchValue: string;
	export let selectedMediaType: string;
	export let mediaTypes: { value: string; icon: string }[];

	function clearSearch() {
		globalSearchValue = '';
	}
</script>

<div class="mb-8 flex w-full flex-col justify-center gap-1 md:hidden">
	<label for="globalSearch">Search</label>
	<div class="input-group input-group-divider grid max-w-md grid-cols-[auto_1fr_auto]">
		<input id="globalSearch" type="text" placeholder="Search" class="input" bind:value={globalSearchValue} />
		{#if globalSearchValue}
			<button onclick={clearSearch} aria-label="Clear" class="variant-filled-surface w-12">
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
						<!-- <p class="flex items-center gap-2">
							<iconify-icon icon={type.icon} width="24" class="text-primary-500"> </iconify-icon>
							<span class="uppercase">{type.value}</span>
						</p> -->
						<iconify-icon icon={type.icon} width="24" class="text-primary-500"><span class="uppercase">{type.value}</span> </iconify-icon>
					</option>
				{/each}
			</select>
		</div>

		<div class="flex flex-col text-center">
			<label for="sortButton">Sort</label>
			<button id="sortButton" class="variant-ghost-surface btn" aria-label="Sort">
				<iconify-icon icon="flowbite:sort-outline" width="24"> </iconify-icon>
			</button>
		</div>
	</div>
</div>
