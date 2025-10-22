<!-- 
@file src/components/Autocomplete.svelte
@component
**Autocomplete component for selecting options from a list**

```tsx
<Autocomplete options={yourOptions} on:select={handleSelection} />
```

#### Props
- `options` {array} - Array of options to be displayed in the dropdown
- `on:select` {function} - Function to be called when an option is selected

Features:
- Filters options based on user input
- Keyboard navigation support
- Customizable placeholder
-->

<script lang="ts">
	interface Props {
		options?: string[];
		placeholder?: string;
		'on:select'?: (selectedOption: string) => void;
	}

	let { options = [], placeholder = 'Select an option', 'on:select': onSelect = () => {} }: Props = $props();

	let keyword = $state('');
	let filteredOptions = $state<string[]>([]);
	let showDropdown = $state(false);
	let selectedIndex = $state(-1);

	// Initialize and update filtered options whenever keyword or options change
	$effect.root(() => {
		if (keyword === '') {
			filteredOptions = [...options];
		} else {
			filteredOptions = options.filter((option) => option.toLowerCase().includes(keyword.toLowerCase()));
		}
	});

	// Define your custom select function here if it's a custom function
	function selectOption(selectedOption: string) {
		keyword = selectedOption;
		showDropdown = false;
		onSelect(selectedOption);
	}

	// Handle keyboard navigation
	function handleKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = (selectedIndex + 1) % filteredOptions.length;
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = (selectedIndex - 1 + filteredOptions.length) % filteredOptions.length;
				break;
			case 'Enter':
				if (selectedIndex !== -1) {
					selectOption(filteredOptions[selectedIndex]);
				}
				break;
			case 'Escape':
				showDropdown = false;
				break;
		}
	}

	// Toggle dropdown
	function toggleDropdown() {
		showDropdown = !showDropdown;
		if (showDropdown) {
			selectedIndex = -1;
		}
	}
</script>

<div class="relative w-full max-w-xs">
	<label for="autocomplete-input" class="sr-only">{placeholder}</label>
	<input
		id="autocomplete-input"
		bind:value={keyword}
		{placeholder}
		class="input w-full rounded-full border-2 border-white px-5 py-3 uppercase text-white placeholder:text-white"
		oninput={() => {
			showDropdown = true;
			selectedIndex = -1;
		}}
		onfocus={() => (showDropdown = true)}
		onblur={() => setTimeout(() => (showDropdown = false), 200)}
		onkeydown={handleKeydown}
		aria-expanded={showDropdown}
		aria-autocomplete="list"
		aria-controls="autocomplete-list"
	/>

	{#if showDropdown && filteredOptions.length > 0}
		<ul
			id="autocomplete-list"
			class="absolute top-full mt-2 max-h-60 w-full overflow-y-auto rounded-md border-2 border-gray-300 bg-white"
			role="listbox"
		>
			{#each filteredOptions as option, index (option)}
				<li
					role="option"
					aria-selected={index === selectedIndex}
					class="cursor-pointer border-b border-gray-200 px-5 py-3 text-left uppercase transition-colors hover:bg-slate-100"
					class:bg-slate-200={index === selectedIndex}
					onmousedown={() => selectOption(option)}
				>
					{option}
				</li>
			{/each}
		</ul>
	{/if}

	<button
		type="button"
		class="absolute right-4 top-1/2 -translate-y-1/2 transform text-white"
		onclick={toggleDropdown}
		aria-label={showDropdown ? 'Close options' : 'Show options'}
	>
		<iconify-icon icon="iconamoon:arrow-down-2-light" width="24"></iconify-icon>
	</button>
</div>
