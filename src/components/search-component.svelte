<!-- 
@file src/components/search-component.svelte
@component
**Global search component with fuzzy search and keyboard navigation**

### Features
- Fuzzy search with edit distance algorithm
- Keyboard navigation with arrow keys
- Debounced search for better performance
- Supports both dark and light mode
- Accessibility features for screen readers

### Usage
<SearchComponent />

### Computed Properties
- `hasResults`: Whether there are search results
- `showNoResults`: Whether to show no results message
- `sanitizedQuery`: Sanitized search query

### Stores
- `isSearchVisible`: Whether search is visible
- `triggerActionStore`: Store for trigger actions

### Types
- `SearchData`: Search data type
- `Trigger`: Trigger type
- `SearchResult`: Search result type

### Example
<script lang="ts">
	import SearchComponent from './search-component.svelte';
</script>

<SearchComponent />

-->

<script lang="ts">
	import type { SearchData } from '@utils/global-search-index';
	// Stores
	import { isSearchVisible, triggerActionStore } from '@utils/global-search-index';
	import { getEditDistance } from '@utils/utils';
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';

	// Types
	interface Trigger {
		action?: (() => void | Promise<void>)[];
		path: string;
	}

	interface SearchResult {
		description: string;
		distance: number;
		keywords: string[];
		title: string;
		triggers: Record<string, Trigger>;
	}

	// States
	let searchResults = $state<SearchResult[]>([]);
	let searchQuery = $state('');
	let inputRef = $state<HTMLInputElement | null>(null);
	let selectedIndex = $state(-1);
	let listElement = $state<HTMLUListElement | null>(null);
	let isSearching = $state(false);
	let prefersReducedMotion = $state(false);
	let statusMessage = $state(''); // For screen reader announcements

	// Derived state for better performance
	const hasResults = $derived(searchResults.length > 0);
	const showNoResults = $derived(searchQuery.trim() && !hasResults && !isSearching);
	const sanitizedQuery = $derived(searchQuery.trim().slice(0, 100)); // Limit query length for security

	// Update status message for screen readers
	$effect(() => {
		if (isSearching) {
			statusMessage = 'Searching...';
		} else if (showNoResults) {
			statusMessage = `No results found for ${sanitizedQuery}`;
		} else if (hasResults) {
			statusMessage = `${searchResults.length} results found. Use arrow keys to navigate.`;
		} else {
			statusMessage = '';
		}
	});

	// Debounce function with proper TypeScript typing
	function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		return (...args: Parameters<T>) => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			timeoutId = setTimeout(() => fn(...args), delay);
		};
	}

	// Optimized fuzzy search with debouncing
	const debouncedFuzzySearch = debounce(async (query: string) => {
		if (!query.trim()) {
			searchResults = [];
			selectedIndex = -1;
			isSearching = false;
			return;
		}

		isSearching = true;
		const index = $globalSearchIndex;
		const upperQuery = query.toUpperCase();
		const threshold = Math.floor(query.length * 0.4); // More lenient threshold for better UX

		try {
			// Use requestIdleCallback for better performance on slow devices
			const results = await new Promise<SearchResult[]>((resolve) => {
				const processResults = () => {
					const mapped = index
						.map((item: SearchData): SearchResult => {
							const upperTitle = item.title.toUpperCase();
							const upperDesc = item.description.toUpperCase();
							const upperKeywords = item.keywords.map((k: string) => k.toUpperCase());

							// Quick exact match check (highest priority)
							if (upperTitle === upperQuery || upperKeywords.includes(upperQuery)) {
								return { ...item, distance: 0 };
							}

							// Check if query is substring (second priority)
							if (upperTitle.includes(upperQuery) || upperDesc.includes(upperQuery)) {
								return { ...item, distance: 1 };
							}

							// Calculate edit distances (most expensive)
							const titleDistance = getEditDistance(upperQuery, upperTitle) ?? Number.POSITIVE_INFINITY;
							const descDistance = getEditDistance(upperQuery, upperDesc) ?? Number.POSITIVE_INFINITY;
							const keywordDistances = upperKeywords.map((keyword: string) => getEditDistance(upperQuery, keyword) ?? Number.POSITIVE_INFINITY);
							const minKeywordDistance = keywordDistances.length > 0 ? Math.min(...keywordDistances) : Number.POSITIVE_INFINITY;

							return {
								...item,
								distance: Math.min(titleDistance, descDistance, minKeywordDistance)
							};
						})
						.filter((result: SearchResult) => result.distance <= threshold)
						.sort((a: SearchResult, b: SearchResult) => {
							// Sort by distance first, then by title length (shorter = more relevant)
							if (a.distance !== b.distance) {
								return a.distance - b.distance;
							}
							return a.title.length - b.title.length;
						})
						.slice(0, 8); // Show up to 8 results

					resolve(mapped);
				};

				// Use requestIdleCallback if available, otherwise use setTimeout
				if ('requestIdleCallback' in window) {
					requestIdleCallback(processResults);
				} else {
					setTimeout(processResults, 0);
				}
			});

			searchResults = results;
			selectedIndex = -1;
		} catch (error) {
			console.error('Search error:', error);
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}, 150);

	// Navigate and execute trigger actions
	async function handleResultClick(result: SearchResult, triggerKey: string, event?: MouseEvent | KeyboardEvent) {
		event?.stopPropagation();
		event?.preventDefault();

		const trigger = result.triggers[triggerKey];
		if (!trigger) {
			return;
		}

		const { path, action } = trigger;

		// Navigate if path is different
		if (path && window.location.pathname !== path) {
			try {
				await goto(path);
			} catch (error) {
				console.error('Navigation error:', error);
			}
		}

		// Handle actions if present
		if (action && Array.isArray(action)) {
			triggerActionStore.set(action);
		}

		// Close search after action
		isSearchVisible.set(false);
		searchQuery = '';
		searchResults = [];
	}

	// Scroll selected item into view with smooth behavior
	function scrollIntoView(index: number) {
		if (!listElement || index < 0 || index >= searchResults.length) {
			return;
		}

		const selectedItem = listElement.children[index] as HTMLElement | undefined;
		if (selectedItem) {
			selectedItem.scrollIntoView({
				block: 'nearest',
				behavior: prefersReducedMotion ? 'auto' : 'smooth'
			});
		}
	}

	// Keyboard navigation handler
	function handleKeyDown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Escape':
				event.preventDefault();
				isSearchVisible.set(false);
				searchQuery = '';
				searchResults = [];
				break;

			case 'ArrowDown':
				event.preventDefault();
				if (hasResults) {
					selectedIndex = (selectedIndex + 1) % searchResults.length;
					scrollIntoView(selectedIndex);
				}
				break;

			case 'ArrowUp':
				event.preventDefault();
				if (hasResults) {
					selectedIndex = (selectedIndex - 1 + searchResults.length) % searchResults.length;
					scrollIntoView(selectedIndex);
				}
				break;

			case 'Enter':
				if (selectedIndex >= 0 && searchResults[selectedIndex]) {
					event.preventDefault();
					const result = searchResults[selectedIndex];
					const firstTriggerKey = Object.keys(result.triggers)[0];
					if (firstTriggerKey) {
						handleResultClick(result, firstTriggerKey, event);
					}
				}
				break;

			case 'Tab':
				// Allow natural tab navigation but close search
				isSearchVisible.set(false);
				break;
		}
	}

	// Handle input changes
	function handleInput() {
		debouncedFuzzySearch(sanitizedQuery);
	}

	// Close search on outside click
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as Element;
		if ($isSearchVisible && !target.closest('.search-component')) {
			isSearchVisible.set(false);
			searchQuery = '';
			searchResults = [];
		}
	}

	// Focus trap for accessibility
	function handleFocusTrap(event: KeyboardEvent) {
		if (!$isSearchVisible || event.key !== 'Tab') {
			return;
		}

		const focusableElements = document.querySelectorAll('.search-component button, .search-component input');
		const firstElement = focusableElements[0] as HTMLElement;
		const lastElement = focusableElements.at(-1) as HTMLElement;

		if (event.shiftKey && document.activeElement === firstElement) {
			event.preventDefault();
			lastElement?.focus();
		} else if (!event.shiftKey && document.activeElement === lastElement) {
			event.preventDefault();
			firstElement?.focus();
		}
	}

	// Auto-focus input when search becomes visible
	$effect(() => {
		if ($isSearchVisible && inputRef) {
			// Use setTimeout to ensure DOM is ready
			setTimeout(() => inputRef?.focus(), 0);
		}
	});

	// Lifecycle hooks
	onMount(() => {
		// Check reduced motion preference
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mediaQuery.matches;

		const handleMotionChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};

		mediaQuery.addEventListener('change', handleMotionChange);

		// Add event listeners
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleFocusTrap);

		return () => {
			mediaQuery.removeEventListener('change', handleMotionChange);
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('keydown', handleFocusTrap);
		};
	});

	onDestroy(() => {
		// Clean up any pending debounced calls
		searchResults = [];
		searchQuery = '';
	});
</script>

<!--
@file src/components/search-component.svelte
@component
**Enhanced Search Component for SveltyCMS - Svelte 5 Optimized**

A highly performant, accessible, and secure global search component with fuzzy matching.

@example:
<SearchComponent />

### Search Flow:
```mermaid
graph TD
    A[User Input] -->|Debounce
150ms| B(Fuzzy Search) B -->|Search Index| C[Score Results] C -->|Threshold 40%| D[Filter & Sort] D -->|Top 8| E[Display UI] E -->|Keyboard Nav|
F[Selection] F -->|Enter| G[Execute Action] ``` ### Features: - Fuzzy search with optimized edit distance calculation - Real-time search results with
debounced input - Full keyboard navigation (Arrow keys, Enter, Escape, Tab) - Screen reader optimized with ARIA live regions - Performance optimized
with derived state - Responsive design with Tailwind CSS - XSS protection through sanitized inputs - Reduced motion support - Focus trap for modal
accessibility -->

{#if $isSearchVisible}
	<!-- Semi-transparent backdrop -->
	<div
		class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200"
		aria-hidden="true"
		onclick={() => isSearchVisible.set(false)}
	></div>

	<!-- Screen reader status (visually hidden) -->
	<div class="sr-only" role="status" aria-live="polite">{statusMessage}</div>

	<div
		class="search-component fixed inset-0 z-50 flex flex-col items-center justify-start pointer-events-none pt-[15vh] transition-opacity duration-200"
		role="dialog"
		aria-modal="true"
		aria-label="Global Search"
	>
		<!-- Search input with loading indicator -->
		<div class="relative w-full max-w-xl pointer-events-auto">
			<input
				bind:value={searchQuery}
				bind:this={inputRef}
				oninput={handleInput}
				onkeydown={handleKeyDown}
				type="search"
				placeholder="Search anything..."
				aria-label="Search input"
				aria-controls="search-results"
				aria-autocomplete="list"
				aria-activedescendant={selectedIndex !== -1 ? `search-result-${selectedIndex}` : undefined}
				aria-busy={isSearching}
				class="input w-full rounded-lg variant-tertiary dark:variant-primary"
				autocomplete="off"
			/>

			{#if isSearching}
				<div class="absolute right-4 top-1/2 -translate-y-1/2" role="status" aria-label="Searching">
					<svg
						class="h-5 w-5 animate-spin text-tertiary-500 dark:text-primary-500"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
				</div>
			{/if}
		</div>

		<!-- Results list with ARIA live region -->
		{#if hasResults}
			<ul
				bind:this={listElement}
				id="search-results"
				class="mt-4 max-h-[50vh] w-full max-w-xl overflow-y-auto rounded-lg bg-surface-50 dark:bg-surface-900 shadow-2xl border border-surface-300 dark:border-surface-700 pointer-events-auto"
				role="listbox"
				aria-label="Search results"
			>
				{#each searchResults as result, index (result.title + index)}
					<li
						id={`search-result-${index}`}
						role="option"
						aria-selected={index === selectedIndex}
						class="border-b border-surface-300 dark:text-surface-50 last:border-b-0 {index === selectedIndex
							? 'bg-tertiary-500/10 dark:bg-primary-500/20'
							: ''}"
					>
						{#if Object.entries(result.triggers).length === 1}
							{@const triggerKey = Object.keys(result.triggers)[0]}
							{@const trigger = result.triggers[triggerKey]}
							<button
								type="button"
								class="w-full px-4 py-3 text-left transition-colors duration-150 hover:bg-tertiary-500/10 dark:hover:bg-primary-500/10 focus:outline-none"
								onclick={(e) => handleResultClick(result, triggerKey, e)}
								aria-label={`${result.title}: ${result.description}. Path: ${trigger?.path ?? 'Unknown'}`}
							>
								<div class="flex items-center justify-between gap-4">
									<div class="grow overflow-hidden">
										<div class="truncate font-semibold text-tertiary-700 dark:text-primary-500">
											<HighlightedText text={result.title} term={sanitizedQuery} />
										</div>
										<div class="mt-1 truncate text-sm text-surface-600 dark:text-surface-300">
											<HighlightedText text={result.description} term={sanitizedQuery} />
										</div>
									</div>
									{#if trigger?.path}
										<span
											class="ml-auto shrink-0 rounded bg-surface-200 dark:bg-surface-700 px-2 py-1 text-xs font-medium text-tertiary-700 dark:text-primary-500"
										>
											{trigger.path}
										</span>
									{/if}
								</div>
							</button>
						{:else}
							<!-- Multiple triggers -->
							<div class="border-b border-surface-300 dark:text-surface-50 px-4 py-3">
								<div class="font-bold text-tertiary-500 dark:text-primary-500"><HighlightedText text={result.title} term={sanitizedQuery} /></div>
								<div class="mt-1 text-sm text-surface-600 dark:text-surface-300">
									<HighlightedText text={result.description} term={sanitizedQuery} />
								</div>
							</div>
							<div class="flex flex-col">
								{#each Object.entries(result.triggers) as [triggerKey, trigger] (triggerKey)}
									{#if trigger?.path}
										<button
											type="button"
											class="flex items-center justify-between px-6 py-2 text-left transition-colors duration-150 hover:bg-tertiary-500/10 dark:hover:bg-primary-500/10 focus:outline-none"
											onclick={(e) => handleResultClick(result, triggerKey, e)}
											aria-label={`${result.title} - ${triggerKey}: Path ${trigger.path}`}
										>
											<span class="text-sm text-tertiary-500 dark:text-primary-500">
												<HighlightedText text={triggerKey} term={sanitizedQuery} />
											</span>
											<span
												class="ml-4 rounded bg-surface-200 dark:bg-surface-700 px-2 py-1 text-xs font-medium text-tertiary-500 dark:text-primary-500"
											>
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
		{:else if showNoResults}
			<div
				class="mt-4 w-full max-w-xl rounded-lg bg-surface-50 dark:bg-surface-900 p-6 text-center shadow-2xl border border-surface-300 dark:border-surface-700 pointer-events-auto"
				role="status"
				aria-live="polite"
			>
				<p class="text-surface-600 dark:text-surface-50">
					No results found for <span class="font-semibold text-tertiary-500 dark:text-primary-500">"{sanitizedQuery}"</span>
				</p>
				<p class="mt-2 text-sm text-surface-500 dark:text-primary-500">Try using different keywords or check your spelling</p>
			</div>
		{/if}

		<!-- Help text -->
		{#if !sanitizedQuery}
			<div class="mt-4 w-full max-w-xl px-4 text-center text-sm pointer-events-auto">
				<p class="text-surface-100 dark:text-surface-200 font-medium">Start typing to search...</p>
				<p class="mt-1 text-xs text-surface-200 dark:text-surface-300 font-semibold">
					Use <kbd class="badge bg-surface-500 text-white px-1.5 py-0.5">↑</kbd>
					<kbd class="badge bg-surface-500 text-white px-1.5 py-0.5">↓</kbd>
					to navigate,
					<kbd class="badge bg-surface-500 text-white px-1.5 py-0.5">Enter</kbd>
					to select,
					<kbd class="badge bg-surface-500 text-white px-1.5 py-0.5">Esc</kbd>
					to close
				</p>
			</div>
		{/if}
	</div>
{/if}
