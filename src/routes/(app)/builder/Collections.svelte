<script lang="ts">
	import { collection, unAssigned } from '@src/stores/store';
	import { mode } from '@src/stores/store';
	import { categories } from '@src/collections';
	import { page } from '$app/stores';
	import CheckIcon from '@src/components/system/icons/CheckIcon.svelte';
	import CheckBox from '@src/components/system/buttons/CheckBox.svelte';
	import { asAny, obj2formData } from '@src/utils/utils';
	import axios from 'axios';

	import type { User } from '@src/collections/Auth';

	export let modeSet: typeof $mode = 'view';

	let expanded: any = {};
	let user: User = $page.data.user;
	let checked = {};

	for (let category of $categories) {
		for (let collection of category.collections) {
			checked[collection.name as string] = true;
		}
	}

	function saveConfig() {
		let _categories: { name: string; icon: string; collections: string[] }[] = [];
		for (let category of $categories) {
			_categories.push({
				name: category.name,
				icon: category.icon,
				collections: category.collections.map((x) => `🗑️collections.${x.name}🗑️` as string)
			});
		}

		axios.post(`?/saveConfig`, obj2formData({ categories: _categories }), {
			headers: {
				'Content-Type': 'multipart/form-data'
			}
		});
	}
</script>

{#each $categories as category, index}
	<div
		role="button"
		tabindex="0"
		class="tooltip_right arrow relative mb-1 cursor-pointer overflow-visible rounded-sm border bg-[#363b4e] bg-surface-600 py-2 text-center text-white"
		class:arrow_up={expanded[index]}
		on:click={(e) => {
			expanded[index] = !expanded[index];
		}}
		on:keydown={(e) => {
			if (e.key === 'Enter') {
				expanded[index] = !expanded[index];
			}
		}}
	>
		<p>{category.name}</p>
	</div>

	<div class:expand={expanded[index]} class="wrapper">
		<div class={expanded[index] ? 'delayed-overflow' : 'overflow-hidden'}>
			{#each category.collections.filter((c) => modeSet == 'edit' || c?.permissions?.[user.role]?.read != false) as _collection}
				<button
					class="relative flex h-[40px] w-full cursor-pointer items-center justify-center border-b border-surface-200 bg-[#777a89] p-0 text-center text-white last:mb-1 last:border-b-0 hover:bg-[#65dfff] hover:text-white dark:bg-surface-400 dark:text-white dark:hover:bg-[#65dfff] dark:hover:text-white"
					on:click={(e) => {
						mode.set(modeSet);
						collection.set(_collection);
					}}
				>
					{#if modeSet == 'edit'}
						<CheckBox
							bind:checked={checked[asAny(_collection.name)]}
							callback={() => {
								checked = checked;
								category.collections = category.collections.filter((x) => x.name != _collection.name);
								$unAssigned = [...$unAssigned, _collection];
							}}
							svg={CheckIcon}
						/>
					{/if}
					<span class="mx-auto">
						{_collection.name}
					</span>
				</button>
			{/each}

			{#if modeSet == 'edit' && $unAssigned.length > 0}
				<div class="border-b-2" />
				{#each $unAssigned as _collection}
					<button
						class="relative flex h-[40px] w-full cursor-pointer items-center justify-center border-b border-surface-200 bg-[#777a89] p-0 text-center text-white last:mb-1 last:border-b-0 hover:bg-[#65dfff] hover:text-white dark:bg-surface-400 dark:text-white dark:hover:bg-[#65dfff] dark:hover:text-white"
						on:click|preventDefault={(e) => {
							mode.set(modeSet);
							collection.set(_collection);
						}}
					>
						{#if modeSet == 'edit'}
							<CheckBox
								bind:checked={checked[asAny(_collection.name)]}
								callback={() => {
									checked = checked;
									category.collections.push(_collection);
									$unAssigned = $unAssigned.filter((x) => x.name != _collection.name);
								}}
								svg={CheckIcon}
							/>
						{/if}
						<span class="mx-auto">
							{_collection.name}
						</span>
					</button>
				{/each}
			{/if}
		</div>
	</div>
{/each}

{#if modeSet == 'edit'}
	<button class="variant-ghost-primary btn mt-2 w-full" on:click={saveConfig}>Save Categories</button>
{/if}

<style>
	.wrapper {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 0.2s ease-out;
		max-height: 100px;
	}
	.expand {
		grid-template-rows: 1fr;
	}
	.delayed-overflow {
		overflow: hidden;
		animation: overflow 0s ease-out forwards;
		animation-delay: 0.2s;
	}
	@keyframes overflow {
		0% {
			overflow: hidden;
		}
		100% {
			overflow: auto;
		}
	}
	.arrow::after {
		content: '';
		position: absolute;
		right: 0;
		top: 40%;
		transform: translateY(-50%);
		border: solid white;
		border-width: 0 3px 3px 0;
		display: inline-block;
		padding: 3px;
		transform: rotate(45deg);
		margin-right: 10px;
		transition: transform 0.1s ease-in;
	}

	.arrow_up::after {
		transform: rotate(225deg);
	}
</style>
