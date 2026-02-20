<!-- 
@file src/components/autocomplete.svelte
@component
**Enhanced Autocomplete - Svelte 5 Optimized**

Advanced autocomplete component with fuzzy search, keyboard navigation, and accessibility.

@example Basic usage
<Autocomplete 
  {options} 
  onSelect={(value) => console.log(value)} 
/>

@example With custom filtering and multiple selection
<Autocomplete 
  {options}
  bind:value={selectedValue}
  placeholder="Search..."
  allowCustomValue
  showCreateOption
  fuzzySearch
  caseSensitive={false}
/>

### Props
- `options` (string[]): Array of selectable options
- `value` (string): Current selected value (bindable)
- `placeholder` (string): Input placeholder text
- `disabled` (boolean): Disable the component
- `allowCustomValue` (boolean): Allow values not in options
- `showCreateOption` (boolean): Show "Create new" option
- `fuzzySearch` (boolean): Enable fuzzy matching
- `caseSensitive` (boolean): Case-sensitive search
- `maxResults` (number): Maximum results to show
- `onSelect` (function): Callback when option selected

### Features
- Fuzzy search with customizable matching
- Keyboard navigation (Arrow keys, Enter, Escape, Tab)
- Mouse and keyboard support
- Custom value creation
- Debounced search for performance
- ARIA-compliant accessibility
- Reduced motion support
- Loading states
- No results feedback
- Clear button
- Recent selections tracking
-->

<script lang="ts">
	import { fade, scale, slide } from 'svelte/transition';
	import { onDestroy, onMount } from 'svelte';

	interface Props {
		allowCustomValue?: boolean;
		caseSensitive?: boolean;
		disabled?: boolean;
		fuzzySearch?: boolean;
		maxResults?: number;
		onSelect?: (value: string) => void;
		options?: string[];
		placeholder?: string;
		showCreateOption?: boolean;
		value?: string;
	}

	let {
		options = [],
		value = $bindable(''),
		placeholder = 'Select an option',
		disabled = false,
		allowCustomValue = false,
		showCreateOption = false,
		fuzzySearch = true,
		caseSensitive = false,
		maxResults = 50,
		onSelect = () => {}
	}: Props = $props();

	// State
	let keyword = $state('');
	let showDropdown = $state(false);
	let selectedIndex = $state(-1);
	let listElement = $state<HTMLUListElement | null>(null);
	let inputElement = $state<HTMLInputElement | null>(null);
	let dropdownElement = $state<HTMLDivElement | null>(null);
	let prefersReducedMotion = $state(false);
	let recentSelections = $state<string[]>([]);
	let isLoading = $state(false);

	// Constants
	const MAX_RECENT = 5;
	const BLUR_DELAY = 150;

	// Fuzzy match scoring
	function fuzzyMatchScore(text: string, query: string): number {
		const textLower = caseSensitive ? text : text.toLowerCase();
		const queryLower = caseSensitive ? query : query.toLowerCase();

		// Exact match gets highest score
		if (textLower === queryLower) {
			return 1000;
		}

		// Starts with gets high score
		if (textLower.startsWith(queryLower)) {
			return 500;
		}

		// Contains gets medium score
		if (textLower.includes(queryLower)) {
			return 100;
		}

		// Fuzzy match (each character of query in order)
		let score = 0;
		let textIndex = 0;
		for (let i = 0; i < queryLower.length; i++) {
			const charIndex = textLower.indexOf(queryLower[i], textIndex);
			if (charIndex === -1) {
				return 0; // No match
			}
			score += 50 - (charIndex - textIndex); // Closer characters = higher score
			textIndex = charIndex + 1;
		}

		return Math.max(0, score);
	}

	// Filter and sort options
	const filteredOptions = $derived.by(() => {
		if (!keyword.trim()) {
			// Show recent selections when no keyword
			if (recentSelections.length > 0) {
				return recentSelections.slice(0, MAX_RECENT);
			}
			return options.slice(0, maxResults);
		}

		if (fuzzySearch) {
			// Fuzzy search with scoring
			return options
				.map((option) => ({
					option,
					score: fuzzyMatchScore(option, keyword)
				}))
				.filter((item) => item.score > 0)
				.sort((a, b) => b.score - a.score)
				.map((item) => item.option)
				.slice(0, maxResults);
		}
		// Simple substring search
		const keywordCompare = caseSensitive ? keyword : keyword.toLowerCase();
		return options
			.filter((option) => {
				const optionCompare = caseSensitive ? option : option.toLowerCase();
				return optionCompare.includes(keywordCompare);
			})
			.slice(0, maxResults);
	});

	// Check if we should show "Create new" option
	const shouldShowCreateOption = $derived(
		showCreateOption &&
			allowCustomValue &&
			keyword.trim() &&
			!filteredOptions.some((opt) => (caseSensitive ? opt === keyword : opt.toLowerCase() === keyword.toLowerCase()))
	);

	// Combined display options (filtered + create option)
	const displayOptions = $derived(shouldShowCreateOption ? [...filteredOptions, `Create: "${keyword}"`] : filteredOptions);

	const hasOptions = $derived(displayOptions.length > 0);
	const showNoResults = $derived(keyword.trim() && !hasOptions && !isLoading);

	// Select option
	function selectOption(selectedOption: string) {
		// Handle "Create new" option
		if (selectedOption.startsWith('Create: "')) {
			const newValue = keyword.trim();
			value = newValue;
			keyword = newValue;

			// Add to recent selections
			addToRecent(newValue);
		} else {
			value = selectedOption;
			keyword = selectedOption;

			// Add to recent selections
			addToRecent(selectedOption);
		}

		showDropdown = false;
		selectedIndex = -1;
		onSelect(value);
	}

	// Add to recent selections
	function addToRecent(option: string) {
		recentSelections = [option, ...recentSelections.filter((item) => item !== option)].slice(0, MAX_RECENT);
	}

	// Clear selection
	function clearSelection() {
		keyword = '';
		value = '';
		showDropdown = false;
		selectedIndex = -1;
		inputElement?.focus();
	}

	// Scroll selected item into view
	function scrollIntoView(index: number) {
		if (!listElement || index < 0 || index >= displayOptions.length) {
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

	// Keyboard navigation
	function handleKeydown(event: KeyboardEvent) {
		if (disabled) {
			return;
		}

		const optionsLength = displayOptions.length;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				if (showDropdown) {
					selectedIndex = (selectedIndex + 1) % optionsLength;
				} else {
					showDropdown = true;
					selectedIndex = 0;
				}
				scrollIntoView(selectedIndex);
				break;

			case 'ArrowUp':
				event.preventDefault();
				if (showDropdown) {
					selectedIndex = (selectedIndex - 1 + optionsLength) % optionsLength;
				} else {
					showDropdown = true;
					selectedIndex = optionsLength - 1;
				}
				scrollIntoView(selectedIndex);
				break;

			case 'Enter':
				event.preventDefault();
				if (showDropdown && selectedIndex >= 0 && displayOptions[selectedIndex]) {
					selectOption(displayOptions[selectedIndex]);
				} else if (showDropdown && optionsLength === 1) {
					// Auto-select if only one option
					selectOption(displayOptions[0]);
				} else if (allowCustomValue && keyword.trim()) {
					// Allow custom value on Enter
					selectOption(keyword.trim());
				}
				break;

			case 'Escape':
				event.preventDefault();
				if (showDropdown) {
					showDropdown = false;
					selectedIndex = -1;
				} else {
					clearSelection();
				}
				break;

			case 'Tab':
				// Close dropdown on Tab
				showDropdown = false;
				selectedIndex = -1;
				break;
		}
	}

	// Toggle dropdown
	function toggleDropdown() {
		if (disabled) {
			return;
		}
		showDropdown = !showDropdown;
		if (showDropdown) {
			selectedIndex = -1;
			inputElement?.focus();
		}
	}

	// Focus handler
	function handleFocus() {
		if (disabled) {
			return;
		}
		showDropdown = true;
	}

	// Blur handler with delay
	let blurTimeout: ReturnType<typeof setTimeout> | null = null;

	function handleBlur(event: FocusEvent) {
		const relatedTarget = event.relatedTarget as HTMLElement | null;

		// Don't close if focus moved to dropdown
		if (dropdownElement?.contains(relatedTarget)) {
			return;
		}

		blurTimeout = setTimeout(() => {
			showDropdown = false;
			selectedIndex = -1;
		}, BLUR_DELAY);
	}

	// Input handler
	function handleInput() {
		if (disabled) {
			return;
		}
		showDropdown = true;
		selectedIndex = -1;
	}

	// Click outside handler
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (dropdownElement && !dropdownElement.contains(target) && inputElement && !inputElement.contains(target)) {
			showDropdown = false;
			selectedIndex = -1;
		}
	}

	// Option click handler (mousedown prevents blur)
	function handleOptionMouseDown(option: string, event: MouseEvent) {
		event.preventDefault();
		selectOption(option);
	}

	// Setup click outside listener
	$effect(() => {
		if (showDropdown) {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});

	// Sync keyword with value
	$effect(() => {
		if (value && !keyword) {
			keyword = value;
		}
	});

	// Lifecycle
	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mediaQuery.matches;

		const handleChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};

		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	});

	onDestroy(() => {
		if (blurTimeout) {
			clearTimeout(blurTimeout);
		}
	});
</script>

<div class="relative w-full" bind:this={dropdownElement}>
	<!-- Label (screen reader only) -->
	<label for="autocomplete-input" class="sr-only"> {placeholder} </label>

	<!-- Input wrapper -->
	<div class="relative">
		<input
			id="autocomplete-input"
			bind:this={inputElement}
			bind:value={keyword}
			{placeholder}
			{disabled}
			class="input w-full rounded-lg border-2 border-surface-300 px-4 py-3 pr-20 transition-all duration-200 placeholder:text-surface-400 focus:border-primary-500 focus:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 dark:border-surface-600 dark:bg-surface-800"
			oninput={handleInput}
			onfocus={handleFocus}
			onblur={handleBlur}
			onkeydown={handleKeydown}
			aria-expanded={showDropdown}
			aria-autocomplete="list"
			aria-controls="autocomplete-list"
			aria-activedescendant={selectedIndex !== -1 ? `option-${selectedIndex}` : undefined}
			aria-describedby={showNoResults ? 'no-results-message' : undefined}
			autocomplete="off"
			role="combobox"
		/>

		<!-- Action buttons -->
		<div class="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
			<!-- Clear button -->
			{#if keyword && !disabled}
				<button
					type="button"
					class="btn-icon btn-icon-sm preset-outlined-surface-500 transition-all duration-200 hover:scale-110 hover:bg-error-500/10 hover:text-error-500"
					onclick={clearSelection}
					aria-label="Clear selection"
					tabindex="-1"
					transition:scale={{ duration: prefersReducedMotion ? 0 : 200 }}
				>
					<iconify-icon icon="mdi:close-circle" width="20"></iconify-icon>
				</button>
			{/if}

			<!-- Dropdown toggle -->
			<button
				type="button"
				class="btn-icon btn-icon-sm preset-outlined-surface-500 transition-all duration-200 hover:scale-110"
				onclick={toggleDropdown}
				aria-label={showDropdown ? 'Close options' : 'Show options'}
				aria-controls="autocomplete-list"
				{disabled}
				tabindex="-1"
			>
				<iconify-icon icon="mdi:chevron-down" width="24" class="transition-transform duration-200 {showDropdown ? 'rotate-180' : ''}"></iconify-icon>
			</button>
		</div>
	</div>

	<!-- Dropdown -->
	{#if showDropdown && !disabled}
		<div
			class="absolute z-50 mt-2 w-full overflow-hidden rounded-lg border border-surface-200 bg-white shadow-xl dark:text-surface-50 dark:bg-surface-800"
			transition:slide={{ duration: prefersReducedMotion ? 0 : 200 }}
		>
			<!-- Loading state -->
			{#if isLoading}
				<div class="flex items-center justify-center gap-2 p-4">
					<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div>
					<span class="text-sm text-surface-600 dark:text-surface-50">Loading...</span>
				</div>
			{:else if hasOptions}
				<!-- Options list -->
				<ul bind:this={listElement} id="autocomplete-list" class="max-h-60 overflow-y-auto" role="listbox" aria-label="Available options">
					{#if !keyword.trim() && recentSelections.length > 0}
						<!-- Recent selections header -->
						<li class="border-b border-surface-200 px-4 py-2 text-xs font-semibold text-surface-600 dark:text-surface-50">Recent Selections</li>
					{/if}

					{#each displayOptions as option, index (option)}
						{@const isCreateOption = option.startsWith('Create: "')}
						{@const isSelected = index === selectedIndex}

						<li
							id={`option-${index}`}
							role="option"
							aria-selected={isSelected}
							class="cursor-pointer border-b border-surface-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-primary-500/10 dark:text-surface-50 {isSelected
								? 'bg-primary-500/20'
								: ''} {isCreateOption ? 'font-medium text-primary-500' : 'text-surface-900 dark:text-surface-100'}"
							onmousedown={(e) => handleOptionMouseDown(option, e)}
							onmouseenter={() => (selectedIndex = index)}
						>
							<div class="flex items-center gap-2">
								{#if isCreateOption}
									<iconify-icon icon="mdi:plus-circle" width="18" aria-hidden="true"></iconify-icon>
								{/if}
								<span class="flex-1">{option}</span>
								{#if isSelected}
									<iconify-icon icon="mdi:check" width="18" aria-hidden="true" class="text-primary-500"></iconify-icon>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{:else if showNoResults}
				<!-- No results message -->
				<div
					id="no-results-message"
					class="flex flex-col items-center gap-2 p-6 text-center"
					role="status"
					transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
				>
					<iconify-icon icon="mdi:magnify-close" width="32" class="text-surface-400" aria-hidden="true"></iconify-icon>
					<p class="text-sm text-surface-600 dark:text-surface-50">No results found for "<span class="font-medium">{keyword}</span>"</p>
					{#if allowCustomValue}
						<button type="button" class="preset-outlined-surface-500 btn-sm mt-2" onclick={() => selectOption(keyword)}>Use custom value</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
