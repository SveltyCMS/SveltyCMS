<script lang="ts">
	import { goto } from '$app/navigation';
	import { isSearchVisible, globalSearchIndex, triggerActionStore } from '@utils/globalSearchIndex';
	import { getEditDistance } from '@utils/utils';
	import { onMount } from 'svelte';

	console.log($globalSearchIndex);

	// Define the searchResults array and searchQuery variable
	let searchResults: any[] = [];
	let searchQuery = '';
	let inputRef: HTMLInputElement;

	// Function to perform fuzzy search
	async function fuzzySearch(query: string) {
		console.log('fuzzySearch', query);

		const index = $globalSearchIndex;

		// Use fuzzySearch function to calculate edit distances
		const results = index.map((result) => {
			const titleDistance = getEditDistance(query.toUpperCase(), result.title.toUpperCase()) || 0;
			const keywordDistances = result.keywords.map((keyword) => getEditDistance(query.toUpperCase(), keyword.toUpperCase()) || 0);
			const minKeywordDistance = Math.min(...keywordDistances);

			return {
				...result,
				distance: Math.min(titleDistance, minKeywordDistance)
			};
		});

		// Sort results based on distance (optional)
		const sortedResults = results.sort((a, b) => {
			if (a.distance === undefined) return 1; // Put a before b if a.distance is undefined
			if (b.distance === undefined) return -1; // Put b before a if b.distance is undefined
			return a.distance - b.distance;
		});

		console.log('sortedResults', sortedResults); // Log the results array after sorting

		// Filter results based on a distance threshold
		const threshold = Math.floor(Math.max(query.length * 0.6)); // Adjusted threshold calculation
		console.log('threshold', threshold);
		const fuzzyResults = sortedResults.filter((result) => result.distance !== undefined && result.distance <= threshold);

		// Check for exact matches in title or keywords
		const exactMatches = results.filter(
			(result) =>
				result.title.toUpperCase() === query.toUpperCase() || result.keywords.map((keyword) => keyword.toUpperCase()).includes(query.toUpperCase())
		);

		// If there are exact matches, prioritize them and limit the displayed results to one
		if (exactMatches.length > 0) {
			searchResults = [exactMatches[0]];
		} else {
			// If no exact matches, display fuzzy results with a limit of one
			searchResults = fuzzyResults.slice(0, 1);
		}
	}

	function handleResultClick(result, triggerKey: any) {
		const trigger = result.triggers[triggerKey];

		// console.log('result:', result);
		console.log('triggerKey:', triggerKey);
		console.log('trigger:', trigger);

		if (trigger && trigger.path && trigger.action && trigger.action.length > 0) {
			const { path, action } = trigger;
			const actions = action || [];

			// Store the trigger actions array in the triggerActionStore
			triggerActionStore.set(actions);

			// Navigate to the appropriate page
			goto(path);

			// Close the search component
			isSearchVisible.set(false);
		} else {
			console.error('Error: trigger, trigger.path, or trigger.action is undefined');
		}
	}

	// Function to handle the keydown event
	const onKeyDown = (event: KeyboardEvent) => {
		// Escape key closes the search component
		if (event.key === 'Escape' && $isSearchVisible) {
			isSearchVisible.set(false);
		}

		// Enter selects the first result
		if (event.key === 'Enter' && searchResults.length > 0) {
			isSearchVisible.set(false);
			handleResultClick(searchResults[0], Object.keys(searchResults[0].triggers)[0]); // Pass both the result and triggerKey
		}
	};

	// Function to handle click events outside the search component
	const handleClickOutside = (event: MouseEvent) => {
		if ($isSearchVisible && event.target && !(event.target as Element).closest('.max-w-lg')) {
			isSearchVisible.set(false);
		}
	};
	// Add event listeners when the component is mounted
	onMount(() => {
		// Focus the input field
		if (inputRef) {
			inputRef.focus();
		}
		// Add event listener for click events outside the search component
		document.addEventListener('click', handleClickOutside);
		// Remove event listeners when the component is unmounted
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

{#if $isSearchVisible}
	<div class="fixed bottom-0 left-0 right-0 top-0 z-50 flex flex-col items-center justify-center bg-gray-900/50 backdrop-blur-sm">
		<!-- Search input -->
		<input
			on:input={() => fuzzySearch(searchQuery)}
			bind:value={searchQuery}
			on:keydown={onKeyDown}
			bind:this={inputRef}
			type="text"
			placeholder="Global Search ..."
			class="input mx-2 w-full max-w-xl rounded-md border-4 !border-primary-500 px-4 py-2"
		/>

		<!-- Search results -->
		<ul class="mt-1 grid w-full max-w-xl overflow-auto rounded px-2 py-1 bg-surface-active-token">
			{#each searchResults as result (result.title)}
				<button class="border-b text-white last:border-0 last:pb-2 hover:bg-surface-400" on:click={() => handleResultClick(result, triggerKey)}>
					<div class="grid grid-cols-3 items-center text-left sm:grid-cols-4">
						<p class="text-left font-semibold text-primary-500">{result.title}:</p>
						<p class="text-center text-sm sm:col-span-2 sm:text-left">{result.description}</p>

						{#if Object.entries(result.triggers).length === 1}
							{#each Object.entries(result.triggers) as [trigger]}
								<p class="text-right text-xs text-primary-500">{trigger.path}</p>
							{/each}
						{/if}
					</div>

					<!-- Multiple triggers -->
					{#if Object.entries(result.triggers).length > 1}
						<div class="grid sm:col-span-2">
							{#each Object.entries(result.triggers) as [triggerKey, trigger]}
								<button
									class="flex items-center justify-between px-6 py-1 hover:bg-surface-500"
									on:click={() => handleResultClick(result, triggerKey)}
								>
									<p class="text-xs">{triggerKey}</p>
									<p class="text-xs text-primary-500">{trigger.path}</p>
								</button>
							{/each}
						</div>
					{/if}
				</button>
			{/each}
		</ul>
	</div>
{/if}
