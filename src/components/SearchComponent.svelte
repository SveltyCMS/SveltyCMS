<!--
@file src/components/SearchComponent.svelte
@component
**Search Component for SveltyCMS**

@example:
<WatermarkSettings bind:size bind:opacity bind:positionX bind:positionY bind:rotation />

### Props:
- `globalSearchValue` {string}: Current value of the global search input (default: '')
- `searchShow` {boolean}: Visibility of the search input (default: false)
- `filterShow` {boolean}: Visibility of filter controls (default: false)
- `columnShow` {boolean}: Visibility of column controls (default: false)
- `density` {string}: Table density ('compact', 'normal', 'comfortable') (default: 'normal')
- `densityOptions` {string[]}: Custom density options (default: ['compact', 'normal', 'comfortable'])

### Features:
- Fuzzy search with optimized edit distance calculation
- Real-time search results with debounced input
- Keyboard navigation support
- Responsive design
- Enhanced accessibility
- Performance optimized state management
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { getEditDistance } from '@utils/utils';
	import { onMount } from 'svelte';

	// Component
	import HighlightedText from './HighlightedText.svelte';

	// Stores
	import { isSearchVisible, globalSearchIndex, triggerActionStore } from '@utils/globalSearchIndex';
	import type { SearchData } from '@utils/globalSearchIndex';

	// Types
	interface Trigger {
		path: string;
		action?: (() => void | Promise<void>)[];
	}

	interface SearchResult {
		title: string;
		description: string;
		keywords: string[];
		triggers: Record<string, Trigger>;
		distance?: number; // Optional because it's added during search
	}

	// States
	let searchResults = $state<SearchResult[]>([]);
	let searchQuery = $state('');
	let inputRef = $state<HTMLInputElement | null>(null);
	let selectedIndex = $state(-1);
	let listElement = $state<HTMLUListElement | null>(null); // Ref for scrolling active descendant

	// Debounce function
	function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		return (...args: Parameters<T>) => {
			if (timeoutId) clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn(...args), delay);
		};
	}

	// Optimized fuzzy search with debouncing
	const debouncedFuzzySearch = debounce(async (query: string) => {
		if (!query.trim()) {
			searchResults = [];
			selectedIndex = -1; // Reset index on clear
			return;
		}

		const index = $globalSearchIndex;
		const upperQuery = query.toUpperCase();
		const threshold = Math.floor(query.length * 0.9); // Adjust threshold as needed

		// Map, filter, and sort
		const results = index
			.map((item: SearchData): SearchResult & { distance: number } => {
				// Ensure distance is always number for sorting
				const upperTitle = item.title.toUpperCase();
				const upperKeywords = item.keywords.map((k: string) => k.toUpperCase());

				// Quick exact match check before expensive edit distance calculation
				if (upperTitle === upperQuery || upperKeywords.includes(upperQuery)) {
					return { ...item, distance: 0 };
				}

				// Calculate edit distances only if necessary
				const titleDistance = getEditDistance(upperQuery, upperTitle) ?? Infinity;
				const keywordDistances = upperKeywords.map((keyword: string) => getEditDistance(upperQuery, keyword) ?? Infinity);
				const minKeywordDistance = keywordDistances.length > 0 ? Math.min(...keywordDistances) : Infinity;

				return {
					...item,
					distance: Math.min(titleDistance, minKeywordDistance)
				};
			})
			.filter((result: SearchResult & { distance: number }) => {
				// Already calculated distance, check includes as fallback
				if (result.distance <= threshold) return true;
				const upperTitle = result.title.toUpperCase();
				if (upperTitle.includes(upperQuery)) return true;
				if (result.keywords.some((keyword: string) => keyword.toUpperCase().includes(upperQuery))) return true;
				return false;
			})
			.sort((a: SearchResult & { distance: number }, b: SearchResult & { distance: number }) => a.distance - b.distance); // Sort by distance ascending

		searchResults = results.slice(0, 5); // Limit results
		selectedIndex = -1; // Reset index when results change
	}, 150); // Debounce delay

	async function handleResultClick(result: SearchResult, triggerKey: string, event?: MouseEvent | KeyboardEvent) {
		event?.stopPropagation();
		event?.preventDefault(); // Prevent default button behavior if triggered by keypress

		const trigger = result.triggers[triggerKey] as Trigger | undefined; // Use undefined for safety

		if (trigger) {
			const { path, action } = trigger;

			// Navigate if path is different
			if (window.location.pathname !== path) {
				// FIX: Added await and eslint ignore
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				await goto(path);
			}

			// Handle actions if present
			if (action) {
				triggerActionStore.set(action);
			}
		}

		isSearchVisible.set(false); // Close search after action
	}

	// Scroll selected item into view
	function scrollIntoView(index: number) {
		if (listElement && index >= 0 && index < searchResults.length) {
			const selectedItem = listElement.children[index] as HTMLLIElement | undefined;
			selectedItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	}

	// Keyboard navigation handler
	function handleKeyDown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Escape':
				if ($isSearchVisible) {
					// Use .value for store read in non-reactive context
					event.preventDefault();
					isSearchVisible.set(false);
				}
				break;
			case 'ArrowDown':
			case 'ArrowUp':
				event.preventDefault();
				if (searchResults.length > 0) {
					const direction = event.key === 'ArrowDown' ? 1 : -1;
					selectedIndex = (selectedIndex + direction + searchResults.length) % searchResults.length;
					scrollIntoView(selectedIndex);
				}
				break;
			case 'Enter':
				if (selectedIndex >= 0 && searchResults[selectedIndex]) {
					event.preventDefault();
					const result = searchResults[selectedIndex];
					// Assume the first trigger is the primary one for Enter key
					const firstTriggerKey = Object.keys(result.triggers)[0];
					if (firstTriggerKey) {
						handleResultClick(result, firstTriggerKey, event);
					}
				}
				break;
			// Allow Tab to move focus naturally
			case 'Tab':
				isSearchVisible.set(false);
				break;
		}
	}

	// Handle input changes
	function handleInput() {
		debouncedFuzzySearch(searchQuery);
	}

	// Close search on outside click
	function handleClickOutside(event: MouseEvent) {
		// Use .value for store read in non-reactive context
		if ($isSearchVisible && event.target && !(event.target as Element).closest('.search-component')) {
			isSearchVisible.set(false);
		}
	}

	// Lifecycle
	$effect(() => {
		// Auto-focus input when search becomes visible
		if ($isSearchVisible && inputRef) {
			inputRef.focus();
		}
	});

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});
</script>

{#if $isSearchVisible}
	<div
		class="search-component fixed inset-0 z-999999 flex flex-col items-center justify-start bg-gray-950/70 pt-[15vh] backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-label="Global Search"
	>
		<!-- Search input -->
		<input
			bind:value={searchQuery}
			bind:this={inputRef}
			oninput={handleInput}
			onkeydown={handleKeyDown}
			type="search"
			placeholder="Global Search ..."
			aria-label="Search input"
			aria-controls="search-results"
			aria-autocomplete="list"
			aria-activedescendant={selectedIndex !== -1 ? `search-result-${selectedIndex}` : undefined}
			class="input mx-2 w-full max-w-xl rounded-md border-4 border-primary-500! px-4 py-3 text-lg"
			autocomplete="off"
		/>

		{#if searchResults.length > 0}
			<ul
				bind:this={listElement}
				id="scroll-smooth"
				class="mt-2 max-h-[50vh] w-full max-w-xl overflow-y-auto rounded-lg bg-surface-800/95 shadow-lg"
				role="listbox"
				aria-label="Search results"
			>
				{#each searchResults as result, index (result.title + index)}<li
						id={`search-result-${index}`}
						role="option"
						aria-selected={index === selectedIndex}
						class="border-b border-surface-700 last:border-b-0 focus-within:outline-none {index === selectedIndex ? 'bg-primary-500/20' : ''}"
					>
						{#if Object.entries(result.triggers).length === 1}
							{@const triggerKey = Object.keys(result.triggers)[0]}
							{@const trigger = result.triggers[triggerKey]}
							<button
								type="button"
								class="w-full px-4 py-3 text-left text-white transition-colors duration-150 hover:bg-primary-500/10 focus:bg-primary-500/10 focus:outline-none"
								onclick={(e) => handleResultClick(result, triggerKey, e)}
								aria-label={`${result.title}: ${result.description}. Path: ${trigger?.path ?? 'N/A'}`}
							>
								<div class="flex items-center justify-between gap-4">
									<div class="grow overflow-hidden">
										<div class="truncate font-semibold text-primary-300">
											<HighlightedText text={result.title} term={searchQuery} />
										</div>
										<div class="mt-1 truncate text-sm text-surface-300">
											<HighlightedText text={result.description} term={searchQuery} />
										</div>
									</div>
									{#if trigger?.path}
										<span class="ml-auto shrink-0 rounded bg-surface-700 px-2 py-0.5 text-xs text-primary-400">
											{trigger.path}
										</span>
									{/if}
								</div>
							</button>
						{:else}
							<div class="border-b border-surface-700 px-4 py-3">
								<div class="font-bold text-primary-300">
									<HighlightedText text={result.title} term={searchQuery} />
								</div>
								<div class="mt-1 text-sm text-surface-300">
									<HighlightedText text={result.description} term={searchQuery} />
								</div>
							</div>
							<div class="flex flex-col text-sm">
								{#each Object.entries(result.triggers) as [triggerKey, trigger] (triggerKey)}
									{#if trigger?.path}
										<button
											type="button"
											class="flex cursor-pointer items-center justify-between px-6 py-2 text-left text-white transition-colors duration-150 hover:bg-primary-500/10 focus:bg-primary-500/10 focus:outline-none"
											onclick={(e) => handleResultClick(result, triggerKey, e)}
											aria-label={`${result.title} - ${triggerKey}: Path ${trigger.path}`}
										>
											<HighlightedText text={triggerKey} term={searchQuery} />
											<span class="ml-4 rounded bg-surface-700 px-2 py-0.5 text-xs text-primary-400">
												{trigger.path}
											</span>
										</button>
									{/if}
								{/each}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{:else if searchQuery.trim()}
			<div class="mt-4 w-full max-w-xl rounded-lg bg-surface-800/95 p-6 text-center text-surface-400 shadow-lg">
				No results found for "{searchQuery}"
			</div>
		{/if}
	</div>
{/if}
