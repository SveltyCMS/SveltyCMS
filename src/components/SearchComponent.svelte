<script lang="ts">
	import { goto } from '$app/navigation';
	import { isSearchVisible, globalSearchIndex } from '@utils/globalSearchIndex';
	import { onMount } from 'svelte';

	// Define the searchResults array and searchQuery variable
	let searchResults: any[] = [];
	let searchQuery = '';
	let inputRef: HTMLInputElement;

	// Function to search the global search index
	async function search(query: string) {
		// Get the global search index
		const index = $globalSearchIndex;

		// Search the global search index for the query
		searchResults = index.filter((result: any) => {
			return (
				result.title.includes(query) ||
				result.description.includes(query) ||
				result.keywords.some((keyword: string) => keyword.includes(query)) ||
				Object.values(result.triggers).some((trigger: any) => trigger.path.includes(query))
			);
		});
	}

	// Function to handle the result click
	function handleResultClick(result: any) {
		const triggerKeys = Object.keys(result.triggers);
		const trigger: string = triggerKeys[0];
		const path = result.triggers[trigger].path;
		const action = result.triggers[trigger].modal;

		// Navigate to the appropriate page and call the modal function
		goto(path);

		// Check if action is a function before calling it
		if (typeof action === 'function') {
			action();
		} else {
			console.error('Error: action is not a function');
		}

		// Close the search component
		isSearchVisible.set(false);
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
			handleResultClick(searchResults[0]); // Pass only searchResults[0] as argument
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
			type="text"
			class="input mx-2 w-full max-w-xl rounded-md border-4 !border-primary-500 px-4 py-2"
			placeholder="Global Search ..."
			bind:value={searchQuery}
			on:input={() => search(searchQuery)}
			on:keydown={onKeyDown}
			bind:this={inputRef}
		/>

		<!-- Search results -->
		<ul class="mt-1 grid w-full max-w-xl overflow-auto rounded px-2 py-1 bg-surface-active-token">
			{#each searchResults as result (result.title)}
				<button class=" border-b text-white last:border-0 last:pb-2 hover:bg-surface-400" on:click={() => handleResultClick(result)}>
					<div class="grid grid-cols-3 items-center text-left sm:grid-cols-4">
						<p class="text-left font-semibold text-primary-500">{result.title}:</p>
						<p class="text-center text-sm sm:col-span-2 sm:text-left">{result.description}</p>
						{#if Object.entries(result.triggers).length === 1}
							{#each Object.entries(result.triggers) as [triggerKey, trigger]}
								<p class="text-right text-xs text-primary-500">{trigger.path}</p>
							{/each}
						{/if}
					</div>

					<!-- Multiple triggers -->
					{#if Object.entries(result.triggers).length > 1}
						<div class="grid sm:col-span-2">
							{#each Object.entries(result.triggers) as [triggerKey, trigger]}
								<button class="flex items-center justify-between px-6 py-1 hover:bg-surface-500" on:click={() => handleResultClick(result, trigger)}>
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
