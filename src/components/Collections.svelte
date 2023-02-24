<script lang="ts">
	import type { Schema } from '$src/collections/types';
	import { shape_fields } from '$src/lib/utils/utils_svelte';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';

	// Popup Tooltips
	let CategorySettings: PopupSettings = {
		event: 'hover',
		target: 'CategoryPopup',
		placement: 'right'
	};

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	export let filterCollections: string;
	export let fields: Array<any>;
	export let collection: Schema;
	export let data: Array<any>;
	export let showFields: boolean;
	export let category = '';
	export let switchSideBar = true;

	let expanded: any = {};

	function setHeight(node: HTMLDivElement) {
		let height = node.clientHeight;
		node.style.setProperty('--height', (height <= 300 ? height : 300) + 'px');
		node.style.maxHeight = '0px';
		node.style.transition = ' 0.5s';
	}

	$: filtered =
		data &&
		data.map((category) => ({
			category: category.category,
			icon: category.icon,
			collections: category.collections.filter((collection: any) =>
				collection.name.toLowerCase().includes(filterCollections)
			)
		}));
	$: {
		if (filterCollections) {
			for (let index in expanded) {
				expanded[index] = true;
			}
		}
	}
</script>

<!-- Show Collection Group Names -->
{#each filtered as item, index}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<div
		use:popup={CategorySettings}
		on:click={(e) => {
			expanded[index] = !expanded[index];
		}}
		class="relative mb-1 h-[40px] cursor-pointer overflow-visible rounded-sm bg-surface-600 py-2 text-center"
		class:arrow_up={expanded[index]}
	>
		<!-- Popup Tooltip with the arrow element -->
		<div class="card variant-filled-secondary p-4" data-popup="CategoryPopup">
			{item.category}
			<div class="arrow variant-filled-secondary" />
		</div>
		<Icon
			icon={item.icon}
			width="24"
			class="absolute top-[50%] left-0 mr-2 ml-2 -translate-y-[50%]"
		/>
		{#if switchSideBar}
			<div class="name">{item.category}</div>
		{/if}
	</div>

	<div use:setHeight class="overflow-hidden " class:expand={expanded[index]}>
		<!-- Show Collection Group Childern -->
		{#each item.collections as _collection}
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<p
				class="relative cursor-pointer border-b border-surface-200 bg-white p-0 text-center text-black last:mb-1 last:border-b-0 hover:bg-[#65dfff] hover:text-white dark:bg-surface-400 dark:text-white dark:hover:bg-[#65dfff] dark:hover:text-white"
				on:click={async () => {
					fields = await shape_fields(_collection.fields);
					category = item.category;
					collection = _collection;
					showFields = false;
				}}
			>
				{#if switchSideBar}
					<div class="flex h-[40px] items-center justify-center">
						<Icon
							icon={_collection.icon}
							width="24"
							class="absolute top-[50%] left-0 ml-2 -translate-y-[50%] text-error-600 "
						/>
						{_collection.name}
					</div>
				{:else}
					<div class="flex flex-col py-1 ">
						<Icon icon={_collection.icon} width="24" class="m-auto text-error-600 " />
						<div class="overflow-clip truncate text-clip text-[9px]">
							{_collection.name}
						</div>
					</div>
				{/if}
			</p>
		{/each}
	</div>
{/each}

<style>
	.expand {
		max-height: var(--height) !important;
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
