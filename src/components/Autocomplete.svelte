<!-- 
@file src/components/Autocomplete.svelte
@component
**Autocomplete component for selecting options from a list**

@example
<Autocomplete options={yourOptions} on:select={handleSelection} />

#### Props
- `options` {array} - Array of options to be displayed in the dropdown
- `on:select` {function} - Function to be called when an option is selected

### Features:
- Filters options based on user input
- Keyboard navigation support
- Customizable placeholder
-->

<script lang="ts">
	import type { AutocompleteProps } from './types';

	const { options = [], placeholder = 'Select an option', 'on:select': onSelect = () => {} }: AutocompleteProps = $props();

	// --- State ---
	let keyword = $state('');
	let showDropdown = $state(false);
	let selectedIndex = $state(-1);
	let listElement = $state(null); // Ref for scrolling

	// --- Derived State (Optimized) ---
	const filteredOptions = $derived(() => {
		// This derived function runs only when `keyword` or `options` changes.
		if (!keyword.trim()) {
			return options; // Show all if keyword is empty
		}
		const keywordLower = keyword.toLowerCase();
		return options.filter((option) => option.toLowerCase().includes(keywordLower));
	});

	// --- Functions ---
	function selectOption(selectedOption: string) {
		keyword = selectedOption;
		showDropdown = false;
		selectedIndex = -1; // Reset index after selection
		onSelect(selectedOption);
	}

	// Scroll the selected item into view
	function scrollIntoView(index: number) {
		if (listElement && index >= 0 && index < filteredOptions.length) {
			const selectedItem = listElement.children[index] as HTMLLIElement | undefined;
			selectedItem?.scrollIntoView({ block: 'nearest' });
			selectedItem?.scrollIntoView({ block: 'nearest' });
		}
	}

	// Handle keyboard navigation
	function handleKeydown(event: KeyboardEvent) {
		const optionsLength = filteredOptions.length;
		if (!optionsLength) return; // No options, do nothing

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = (selectedIndex + 1) % optionsLength;
				scrollIntoView(selectedIndex);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = (selectedIndex - 1 + optionsLength) % optionsLength;
				scrollIntoView(selectedIndex);
				break;
			case 'Enter':
				event.preventDefault(); // Prevent form submission if inside one
				if (selectedIndex !== -1) {
					selectOption(filteredOptions()[selectedIndex]);
				} else if (optionsLength === 1) {
					// If only one option is left, select it on Enter even if not highlighted
					selectOption(filteredOptions()[0]);
				}
				break;
			case 'Escape':
				showDropdown = false;
				break;
			case 'Tab':
				// Allow Tab to close the dropdown naturally
				showDropdown = false;
				break;
		}
	}

	// Toggle dropdown
	function toggleDropdown() {
		showDropdown = !showDropdown;
		if (showDropdown) {
			selectedIndex = -1; // Reset index when opening
		}
	}

	// Handle input focus/blur
	function handleFocus() {
		showDropdown = true;
	}

	function handleBlur() {
		// Use a short delay to allow click/mousedown events on options to register
		setTimeout(() => {
			if (showDropdown) {
				// Check if it wasn't closed by selecting an option
				showDropdown = false;
			}
		}, 150); // Small delay
	}

	function handleInput() {
		showDropdown = true;
		selectedIndex = -1; // Reset selection on input
	}

	// Use mousedown to select before blur closes the dropdown
	function handleOptionMouseDown(option: string) {
		selectOption(option);
	}
</script>

<div class="relative w-full max-w-xs">
	<label for="autocomplete-input" class="sr-only">{placeholder}</label>
	<input
		id="autocomplete-input"
		bind:value={keyword}
		{placeholder}
		class="input w-full rounded-full border-2 border-white px-5 py-3 pr-10 uppercase text-white placeholder:text-white"
		oninput={handleInput}
		onfocus={handleFocus}
		onblur={handleBlur}
		onkeydown={handleKeydown}
		aria-expanded={showDropdown}
		aria-autocomplete="list"
		aria-controls="autocomplete-list"
		aria-activedescendant={selectedIndex !== -1 ? `option-${selectedIndex}` : undefined}
		autocomplete="off"
		role="combobox"
	/>

	{#if showDropdown && filteredOptions().length > 0}
		<ul
			bind:this={listElement}
			id="autocomplete-list"
			class="absolute top-full z-10 mt-2 max-h-60 w-full overflow-y-auto rounded-md border-2 border-gray-300 bg-white shadow-lg"
			role="listbox"
		>
			{#each filteredOptions() as option, index (option)}
				<li
					id={`option-${index}`}
					role="option"
					aria-selected={index === selectedIndex}
					class="cursor-pointer border-b border-gray-200 px-5 py-3 text-left uppercase text-black transition-colors last:border-b-0 hover:bg-slate-100"
					class:bg-slate-200={index === selectedIndex}
					onmousedown={() => handleOptionMouseDown(option)}
				>
					{option}
				</li>
			{/each}
		</ul>
	{/if}

	<button
		type="button"
		class="absolute right-4 top-1/2 -translate-y-1/2 transform text-white focus:outline-none"
		onclick={toggleDropdown}
		aria-label={showDropdown ? 'Close options' : 'Show options'}
		aria-controls="autocomplete-list"
		tabindex="-1"
	>
		<iconify-icon icon="iconamoon:arrow-down-2-light" width="24" class="transition-transform duration-200" class:rotate-180={showDropdown}
		></iconify-icon>
	</button>
</div>
