<!--
@file src/components/SearchComponent.svelte
@description Search Component for Svelte CMS

Features:
- Fuzzy search with edit distance calculation
- Real-time search results
- Keyboard navigation support
- Responsive design
- Accessibility improvements

-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { getEditDistance } from '@utils/utils';
	import { onMount } from 'svelte';

	// Component
	import HighlightedText from './HighlightedText.svelte';

	// Stores
	import { isSearchVisible, globalSearchIndex, triggerActionStore } from '@utils/globalSearchIndex';

	// Define the searchResults array and searchQuery variable
	let searchResults: any[] = [];
	let searchQuery = '';
	let inputRef: HTMLInputElement;
	let selectedIndex = -1; // Track the currently selected result

	// Function to perform fuzzy search
	async function fuzzySearch(query: string) {
		// If the query is empty, clear the search results and return
		if (query === '') {
			searchResults = [];
			return;
		}

		const index = $globalSearchIndex;
		const upperQuery = query.toUpperCase();

		// Calculate distances and filter results
		const results = index
			.map((result) => {
				// Ensure we always have a number for distance calculations
				const titleDistance = getEditDistance(upperQuery, result.title.toUpperCase()) ?? Infinity;
				const keywordDistances = result.keywords.map((keyword) => getEditDistance(upperQuery, keyword.toUpperCase()) ?? Infinity);
				return {
					...result,
					distance: Math.min(titleDistance, ...keywordDistances)
				};
			})
			.filter((result) => {
				const threshold = Math.floor(query.length * 0.9);
				return (
					result.distance <= threshold ||
					result.title.toUpperCase().includes(upperQuery) ||
					result.keywords.some((keyword) => keyword.toUpperCase().includes(upperQuery))
				);
			})
			.sort((a, b) => a.distance - b.distance);

		// Prioritize exact matches
		const exactMatches = results.filter(
			(result) => result.title.toUpperCase() === upperQuery || result.keywords.some((keyword) => keyword.toUpperCase() === upperQuery)
		);

		searchResults = exactMatches.length > 0 ? exactMatches.slice(0, 5) : results.slice(0, 5);
		selectedIndex = -1; // Reset selection when results change
	}

	function handleResultClick(result: any, triggerKey: string) {
		const trigger = result.triggers[triggerKey];

		if (typeof trigger === 'object' && trigger !== null && 'path' in trigger && 'action' in trigger) {
			const { path, action } = trigger;

			// Navigate to the appropriate page if it's not the current page
			if (window.location.pathname !== path) {
				goto(path);
			}

			// Store the trigger actions array in the triggerActionStore
			triggerActionStore.set(action || []);
		} else {
			goto(trigger.path);
		}

		isSearchVisible.set(false);
	}

	// Handle keyboard navigation
	const onKeyDown = (event: KeyboardEvent) => {
		// Escape key closes the search component
		if (event.key === 'Escape' && $isSearchVisible) {
			isSearchVisible.set(false);
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = (selectedIndex + (event.key === 'ArrowDown' ? 1 : -1) + searchResults.length) % searchResults.length;
		} else if (event.key === 'Enter' && selectedIndex >= 0) {
			const result = searchResults[selectedIndex];
			handleResultClick(result, Object.keys(result.triggers)[0]);
		}
	};

	// Close search on outside click
	const handleClickOutside = (event: MouseEvent) => {
		if ($isSearchVisible && event.target && !(event.target as Element).closest('.search-component')) {
			isSearchVisible.set(false);
		}
	};

	onMount(() => {
		if (inputRef) inputRef.focus();
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});
</script>

{#if $isSearchVisible}
	<div class="search-component fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900/50 backdrop-blur-sm">
		<!-- Search input -->
		<input
			bind:value={searchQuery}
			bind:this={inputRef}
			on:input={() => fuzzySearch(searchQuery)}
			on:keydown={onKeyDown}
			type="text"
			placeholder="Global Search ..."
			aria-label="Search input"
			class="input mx-2 w-full max-w-xl rounded-md border-4 !border-primary-500 px-4 py-2"
		/>

		<!-- Search results -->
		<ul class="mt-1 grid w-full max-w-xl overflow-auto rounded px-2 py-1 leading-loose bg-surface-active-token" role="listbox">
			{#each searchResults as result, index (result.title)}
				<li role="option" aria-selected={index === selectedIndex}>
					<button
						class="w-full border-b text-left text-white last:border-0 last:pb-2 hover:bg-surface-400 {index === selectedIndex
							? 'bg-surface-500'
							: ''}"
						on:click={() => handleResultClick(result, Object.keys(result.triggers)[0])}
					>
						<div class="grid auto-cols-auto grid-flow-col">
							<!-- Highlighted title -->
							<span class="whitespace-nowrap font-bold text-primary-500">
								<HighlightedText text={result.title + ' : '} term={searchQuery} />
							</span>

							<!-- Highlighted description -->
							<span class="col-span-2 text-sm">
								<HighlightedText text={result.description} term={searchQuery} />
							</span>

							<!-- Path for items with one trigger -->
							{#if Object.entries(result.triggers).length === 1}
								{#each Object.entries(result.triggers) as [, trigger]}
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
										on:click|stopPropagation={() => handleResultClick(result, triggerKey)}
									>
										<HighlightedText text={triggerKey} term={searchQuery} />
										<span class="text-xs text-primary-500">{trigger.path}</span>
									</button>
								{/each}
							</div>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/if}
