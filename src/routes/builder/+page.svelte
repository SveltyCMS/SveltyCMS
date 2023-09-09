<script lang="ts">
	import '@src/collections';
	import Collections from '@src/components/Collections.svelte';
	import { mode } from '@src/stores/store.js';
	import { collection, unAssigned } from '@src/stores/store';
	import axios from 'axios';
	import { obj2formData } from '@src/utils/utils';
	import WidgetBuilder from './WidgetBuilder.svelte';
	import FloatingInput from '@src/components/system/inputs/floatingInput.svelte';

	let name = $mode == 'edit' ? $collection.name : '';
	let fields = [];
	let addField = false;

	// Function to save data by sending a POST request to the /api/builder endpoint
	function save() {
		let data =
			$mode == 'edit'
				? obj2formData({
						originalName: $collection.name,
						collectionName: name,
						fields: $collection.fields
				  })
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

<div class="body relative">
	<!-- Menu Selection -->
	<section class="left_panel">
		<Collections modeSet={'edit'} />
	</section>
	<p class="text-white">unAssigned Collections</p>
	<p class="text-white">{$unAssigned.map((x) => x.name)}</p>
	<div class="flex w-full flex-col items-center">
		<button
			on:click={() => {
				mode.set('create');
			}}
			class="variant-filled-tertiary btn"
		>
			<iconify-icon icon="typcn:plus" class="text-white" width="30" />
		</button>

		{#if $mode == 'create'}
			<!-- add collection fields -->
			<div class="mt-3 bg-surface-500 p-2">
				<p class="mb-2 text-center">Create Collection</p>
				<FloatingInput label="name" name="name" bind:value={name} />
				<WidgetBuilder {fields} bind:addField />
			</div>
		{:else if $mode == 'edit'}
			<!-- list collection fields -->
			<div class="mt-3 bg-surface-500 p-2">
				<p class="mb-2 text-center">Edit Collection</p>
				<FloatingInput label="name" name="name" bind:value={name} />
				<WidgetBuilder fields={$collection.fields} bind:addField />
			</div>
		{/if}
	</div>
	<button on:click={save} class="variant-filled-primary btn absolute right-14 top-2"> Save </button>
</div>

<style lang="postcss">
	.body {
		display: flex;
		position: fixed;
		width: 75vw;
		height: 90vh;
	}

	section {
		width: 240px;
		padding: 0 4px;
	}
</style>
