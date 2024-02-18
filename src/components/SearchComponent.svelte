<script lang="ts">
	import { goto } from '$app/navigation';
	import { getEditDistance } from '@utils/utils';
	import { onMount } from 'svelte';
	import HighlightedText from './HighlightedText.svelte';

	//Stores
	import { isSearchVisible, globalSearchIndex, triggerActionStore } from '@utils/globalSearchIndex';

	console.log($globalSearchIndex);

	// Define the searchResults array and searchQuery variable
	let searchResults: any[] = [];
	let searchQuery = '';
	let inputRef: HTMLInputElement;

	// Function to perform fuzzy search
	async function fuzzySearch(query: string) {
		// console.log('fuzzySearch', query);

		// If the query is empty, clear the search results and return
		if (query === '') {
			searchResults = [];
			return;
		}

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

		// Filter sortedResults to only include matches that contain the input value
		const filteredResults = sortedResults.filter(
			(result) =>
				result.title.toUpperCase().includes(query.toUpperCase()) ||
				result.keywords.some((keyword) => keyword.toUpperCase().includes(query.toUpperCase()))
		);

		// console.log('sortedResults', sortedResults); // Log the results array after sorting

		// Filter results based on a distance threshold
		const threshold = Math.floor(Math.max(query.length * 0.9)); // Adjusted threshold calculation
		// console.log('threshold', threshold);
		const fuzzyResults = sortedResults.filter((result) => result.distance !== undefined && result.distance <= threshold);

		// Check for exact matches in title or keywords
		const exactMatches = results.filter(
			(result) =>
				result.title.toUpperCase() === query.toUpperCase() || result.keywords.map((keyword) => keyword.toUpperCase()).includes(query.toUpperCase())
		);

		// If there are exact matches, prioritize them and display top 5
		if (exactMatches.length > 0) {
			searchResults = exactMatches.slice(0, 5);
		} else if (filteredResults.length > 0) {
			// If no exact matches but there are filtered results, display top 5 filtered results
			searchResults = filteredResults.slice(0, 5);
		} else {
			// If no exact matches or filtered results, display top 5 fuzzy results
			searchResults = fuzzyResults.slice(0, 5);
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

			console.log('path:', path);
			console.log('action:', action);

			// Store the trigger actions array in the triggerActionStore
			triggerActionStore.set(actions);

			// Navigate to the appropriate page if it's not the current page
			if (window.location.pathname !== path) {
				goto(path);
			}

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
					<div class="grid auto-cols-auto grid-flow-col text-left">
						<!-- Highlighted title -->
						<span class="whitespace-nowrap font-bold text-primary-500">
							<HighlightedText text={result.title + ' : '} term={searchQuery} />
						</span>

						<!-- Highlighted description with full width -->
						<span class="col-span-2 text-sm">
							<HighlightedText text={result.description} term={searchQuery} />
						</span>

						<!-- Path for items with one trigger -->
						{#if Object.entries(result.triggers).length === 1}
							{#each Object.entries(result.triggers) as [triggerKey, trigger]}
								<span class="w-[50px] text-xs text-primary-500">
									{trigger.path}
								</span>
							{/each}
						{/if}
					</div>

					<!-- Multiple triggers -->
					{#if Object.entries(result.triggers).length > 1}
						<div class="grid text-sm sm:col-span-2">
							{#each Object.entries(result.triggers) as [triggerKey, trigger]}
								<button
									class="flex items-center justify-between px-6 py-1 hover:bg-surface-500"
									on:click={() => handleResultClick(result, triggerKey)}
								>
									<!-- Highlighted trigger -->
									<HighlightedText text={triggerKey} term={searchQuery} />
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
