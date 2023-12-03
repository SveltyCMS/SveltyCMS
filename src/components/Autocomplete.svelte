<script lang="ts">
	import { onMount } from 'svelte';
	export let options: string[] = [];
	export let placeholder = 'Select an option';
	let keyword = '';
	let filteredOptions = options;
	let showDropdown = false;

	function onKeyUp() {
		filteredOptions = options.filter((option) => option.toLowerCase().includes(keyword.toLowerCase()));
		showDropdown = true;
	}

	onMount(() => {
		filteredOptions = options;
	});

	function selectOption(selectedOption: any) {
		keyword = selectedOption;
		filteredOptions = [];
		showDropdown = true;
	}
</script>

<div class="flex w-full flex-col items-center justify-center">
	<div class="relative w-60">
		<input
			bind:value={keyword}
			{placeholder}
			class="input w-full rounded-full border-2 border-white px-5 py-3 uppercase text-white placeholder:text-white"
			on:keyup={onKeyUp}
			on:focus={() => {
				showDropdown = true;
			}}
			on:blur={() => {
				showDropdown = false;
			}}
		/>
		{#if showDropdown && filteredOptions.length > 0}
			<div class="absolute top-full mt-2 max-h-60 w-full overflow-y-auto rounded-md border-2 border-gray-300 bg-white">
				{#each filteredOptions as option (option)}
					<button
						on:click={() => selectOption(option)}
						class="text-dark w-full cursor-pointer border-b border-gray-200 px-5 py-3 text-left uppercase transition-colors hover:bg-slate-100"
					>
						{option}
					</button>
				{/each}
			</div>
		{/if}
		<iconify-icon
			icon="iconamoon:arrow-down-2-light"
			width="24"
			class=" absolute right-4 top-1/2 -translate-y-1/2 transform text-white"
			on:click={() => {
				showDropdown = !showDropdown;
			}}
			on:keydown={(event) => {
				if (event.key === 'Enter') {
					showDropdown = !showDropdown;
				}
			}}
			role="button"
			tabindex="0"
		/>
	</div>
</div>
