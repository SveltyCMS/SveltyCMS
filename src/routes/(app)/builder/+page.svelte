<script lang="ts">
	import '@src/collections';
	import Collections from './Collections.svelte';
	import { mode } from '@src/stores/store.js';
	import { collection, unAssigned } from '@src/stores/store';
	import axios from 'axios';
	import { obj2formData } from '@src/utils/utils';
	import WidgetBuilder from './WidgetBuilder.svelte';
	import FloatingInput from '@src/components/system/inputs/floatingInput.svelte';
	import PageTitle from '@src/components/PageTitle.svelte';

	let name = $mode == 'edit' ? $collection.name : '';
	let fields = [];
	let addField = false;

	// Function to save data by sending a POST request to the /api/builder endpoint
	function save() {
		let data =
			$mode == 'edit'
				? obj2formData({ originalName: $collection.name, collectionName: name, fields: $collection.fields })
				: obj2formData({ fields, collectionName: name });
		axios.post(`?/saveCollection`, data, {
			headers: {
				'Content-Type': 'multipart/form-data'
			}
		});
	}
	collection.subscribe((_) => {
		name = $mode == 'edit' ? $collection.name : '';
	});
</script>

<!-- Page Title -->
{#if $mode == 'create'}
	<div class="flex items-center justify-between">
		<PageTitle name="Create New " icon="material-symbols:ink-pen" iconColor="text-primary-500" />
		<!-- Cancel -->

		<button class="variant-ghost-secondary btn-icon mr-2 p-2" on:click={() => mode.set('view')}
			><iconify-icon icon="material-symbols:close" width="24" /></button
		>
	</div>
{:else if $mode == 'edit'}
	<PageTitle name="Edit {name} Category" icon="material-symbols:ink-pen" iconColor="text-primary-500" />
{:else if $mode == 'view'}
	<PageTitle name="Collection Builder" icon="material-symbols:ink-pen" iconColor="text-primary-500" />
	<p class="text-center text-primary-500">Click on any existing Category to edit or Create A New</p>
{/if}

<div class="mt-2 flex">
	{#if $mode == 'view'}
		<!--Left Panel -->
		<section class="w-[280px] pl-1 pt-1">
			<!-- Menu Selection -->
			<p class="text-center text-xl text-primary-500">Category</p>
			<Collections modeSet={'edit'} />

			<!-- unAssigned Selection -->
			{#if $unAssigned && $unAssigned.length > 0}
				<div class="mt-5 flex flex-col items-center justify-center rounded border border-warning-500">
					<p class="border-b text-center text-warning-500">UnAssigned Collections</p>
					<div class="m-1 flex flex-wrap gap-2 text-white">
						{@html $unAssigned.map((x) => `<button class="badge variant-filled-primary" role="button" tabindex="0">${x.name}</button>`).join('')}
					</div>
				</div>
			{/if}
		</section>
	{/if}

	<!--Right Panel -->

	<!-- Display collections -->
	<div class="mt-8 flex w-full flex-col items-center">
		<div class="flex justify-between gap-2">
			<!-- add new Collection -->
			{#if $mode == 'view'}
				<button
					on:click={() => {
						mode.set('create');
					}}
					class="variant-filled-tertiary btn"
				>
					Create New
				</button>
			{/if}

			{#if $mode != 'view'}
				<div class="flex w-screen max-w-[300px] justify-center px-2">
					<!-- Save Collection -->
					<button on:click={save} class="variant-filled-primary btn"> Save Collection</button>
				</div>
			{/if}
		</div>

		{#if $mode == 'create'}
			<!-- add collection fields -->
			<div class="mt-3 bg-surface-500 p-2">
				<FloatingInput label="name" name="name" bind:value={name} />
				<WidgetBuilder {fields} bind:addField />
			</div>
		{:else if $mode == 'edit'}
			<!-- list collection fields -->
			<div class="mt-3 bg-surface-500 p-2">
				<FloatingInput label="name" name="name" bind:value={name} />
				<WidgetBuilder fields={$collection.fields} bind:addField />
			</div>
		{/if}
	</div>
</div>
