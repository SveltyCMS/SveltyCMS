<script>
	import { goto } from '$app/navigation';
	import { isSearchVisible, globalSearchIndex } from '@stores/store';

	// Function to search the global search index
	// async function search(query) {
	// 	// Get the global search index
	// 	const globalSearchIndex = $page.data.globalSearchIndex;

	// 	// Search the global search index for the query
	// 	searchResults = globalSearchIndex.filter((result) => {
	// 		return result.title.includes(query) || result.description.includes(query) || result.keywords.some((keyword) => keyword.includes(query));
	// 	});
	// }

	// Function to handle the result click
	// function handleResultClick(result) {
	// 	// Get the trigger keyword and the corresponding path and modal function
	// 	const trigger = Object.keys(result.value.triggers).find((trigger) => trigger.includes(searchQuery));
	// 	const path = result.value.triggers[trigger].path;
	// 	const modalFunction = result.value.triggers[trigger].modal;

	// 	// Navigate to the appropriate page and call the modal function
	// 	goto(path);
	// 	modalFunction();
	// }

	// Function to handle the keydown event
	// const onKeyDown = (event: KeyboardEvent) => {
	// 	// alt+d is equivalent to 'd' key and event.altKey
	// 	if (event.altKey && event.key === 'd') {
	// 		isSearchVisible = !isSearchVisible;
	// 		// If needed, prevent the default action of "alt+d"
	// 		// event.preventDefault();
	// 	}
	// };
</script>

<div class={isSearchVisible ? 'fixed left-1/2 top-1/4 block -translate-x-1/2 -translate-y-1/2 transform' : 'hidden'}>
	<!-- Search input -->
	<input
		type="text"
		class=" l input w-full rounded-md border-2 !border-primary-500"
		placeholder="Global Search ..."
		on:click={() => isSearchVisible.update((prev) => !prev)}
	/>
	<!-- <input type="text" bind:value={searchQuery} /> -->

	<!-- Search results -->
	<!-- <ul>
		{#each searchResults as result (result.key)}
			<li on:click={handleResultClick(result)}>
				{#if typeof result.value === 'object' && result.value.thumbnail}
				
					<img src={result.value.thumbnail} alt={result.value.name} style="height: 50px; width: 50px;" />
				{/if}
				{result.key}: {result.value}
			</li>
		{/each}
	</ul> -->
</div>
