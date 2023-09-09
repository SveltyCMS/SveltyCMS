<script lang="ts">
	import {
		collection,
		collectionValue,
		mode,
		deleteEntry,
		handleSidebarToggle
	} from '@src/stores/store';
	import { page } from '$app/stores';
	import type { User } from '@src/collections/Auth';
	import { saveFormData, getDates } from '@src/utils/utils';

	let user: User = $page.data.user;

	async function saveData() {
		await saveFormData({ data: $collectionValue });

		// a function to undo the changes made by handleButtonClick
		mode.set('view' || 'edit');
		handleSidebarToggle();
	}

	import { onMount } from 'svelte';

	let dates = { created: '', updated: '', revision: '' };

	// onMount(async () => {
	// 	try {
	// 		dates = await getDates(collection.name);
	// 	} catch (error) {
	// 		console.error(error);
	// 	}
	// });
</script>

<!--  Check User Role collection Permission-->

{#if collection.permissions?.[user.role]?.write != false}
	<!-- Desktop Right Sidebar -->
	{#if $mode == 'view'}
		<button
			type="button"
			on:click={() => mode.set('create')}
			class=" variant-filled-primary btn mt-2"
		>
			<iconify-icon icon="mdi:pen" width="24" />Create
		</button>
	{:else if ['edit', 'create'].includes($mode)}
		<div class="mx-2 mt-2 flex h-screen flex-col justify-between">
			<header class=" text-error-500">
				<button type="button" on:click={saveData} class="variant-filled-primary btn w-full gap-2">
					<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
					Save {$collection.name}
				</button>

				{#if $mode == 'edit'}
					<button
						type="button"
						on:click={$deleteEntry}
						class="variant-filled-error btn mt-2 w-full"
					>
						<iconify-icon icon="icomoon-free:bin" width="24" />Delete {$collection.name}
					</button>
				{/if}
			</header>

			<!-- TODO: Only show it used -->
			<main class="mt-4 text-white">
				<h2 class="font-bold">Admin Widget Area:</h2>
				<p class="mt-2">Seo {$collection.name} widget</p>
			</main>

			<footer class="-mx-1 mb-2 text-white">
				<h2 class="text-center font-bold uppercase text-primary-500">{$collection.name} Info:</h2>

				<div class="mt-2 grid grid-cols-3 items-center gap-x-2 text-[12px] leading-tight">
					{#each Object.keys(dates) as key}
						<div class="capitalize">{key}:</div>
					{/each}

					{#each Object.values(dates) as value}
						<div class="text-primary-500">{value}</div>
					{/each}
				</div>
			</footer>
		</div>
	{:else if $mode == 'delete'}
		<!-- no permission -->
		<button type="button" on:click={$deleteEntry} class="variant-filled-success btn">
			<iconify-icon icon="icomoon-free:bin" width="24" />Delete
		</button>
	{/if}
{:else}
	<!-- TODO: find better rule -->
	<button class="variant-ghost-error btn mt-2">No Permission</button>
{/if}
