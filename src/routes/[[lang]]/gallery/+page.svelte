<script lang="ts">
	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	// show/hide Left Sidebar
	import AnimatedHamburger from '$src/components/AnimatedHamburger.svelte';

	import { toggleLeftSidebar } from '$src/stores/store';
	export let switchSideBar = false;

	//skeleton
	import { Avatar } from '@skeletonlabs/skeleton';

	// import { load } from './generate-thumbnails';
	// let thumbnails;
	// export async function preload(page) {
	// 	const result = await load({ fetch: null });
	// 	thumbnails = result.thumbnails;
	// }

	let view = 'grid';
	let size: 'small' | 'medium' | 'large' = 'small';

	// Refesh tanstack
	$: if (size) {
		refreshData();
	}

	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { flip } from 'svelte/animate';

	//let images: any = [];

	// onMount(async () => {
	// 	const res = await fetch('/gallery.json');
	// 	images = await res.json();
	// });

	// tanstack table

	import {
		createSvelteTable,
		flexRender,
		getCoreRowModel,
		getSortedRowModel,
		getPaginationRowModel
	} from '@tanstack/svelte-table';

	import type { ColumnDef, TableOptions, SortDirection, FilterFn } from '@tanstack/svelte-table';

	type Images = {
		image: string;
		name: string;
		path: string;
	};

	// columns definition
	const defaultColumns: ColumnDef<Images>[] = [
		{
			accessorKey: 'image',
			header: () => 'Image',
			footer: (info) => info.column.id,
			cell: (info) =>
				flexRender(Avatar, {
					src: info.row.original.image,
					width: `${size === 'small' ? 'w-6' : size === 'medium' ? 'w-10' : 'w-14'}`
				})
		},
		{
			accessorKey: 'name',
			header: () => 'Name',
			cell: (info) => info.getValue(),
			footer: (info) => info.column.id
		},
		{
			accessorKey: 'path',
			header: () => 'Path',
			cell: (info) => info.getValue(),
			footer: (info) => info.column.id
		}
	];

	const defaultData: Images[] = [
		{
			image: '/Default_User.svg',
			name: 'Default_User',
			path: '/static/Default_User'
		},
		{
			image: '/SimpleCMS_Logo_Round.png',
			name: 'SimpleCMS_Logo_Round',
			path: '/static/SimpleCMS_Logo_Round'
		},
		{
			image: '/SimpleCMS_Logo.svg',
			name: 'SimpleCMS_Logo',
			path: '/static/SimpleCMS_Logo'
		}
	];

	let columnOrder: never[] = [];
	let columnVisibility = {};
	let sorting: any = [];

	const setColumnOrder = (updater: any) => {
		if (updater instanceof Function) {
			columnOrder = updater(columnOrder);
		} else {
			columnOrder = updater;
		}
		options.update((old) => ({
			...old,
			state: {
				...old.state,
				columnOrder
			}
		}));
	};

	const setColumnVisibility = (updater: any) => {
		if (updater instanceof Function) {
			columnVisibility = updater(columnVisibility);
		} else {
			columnVisibility = updater;
		}
		options.update((old) => ({
			...old,
			state: {
				...old.state,
				columnVisibility
			}
		}));
	};

	const setSorting = (updater: (arg0: any) => any) => {
		if (updater instanceof Function) {
			sorting = updater(sorting);
		} else {
			sorting = updater;
		}
		options.update((old) => ({
			...old,
			state: {
				...old.state,
				sorting
			}
		}));
	};

	const options = writable<TableOptions<Images>>({
		data: defaultData,
		columns: defaultColumns,
		state: {
			columnOrder,
			sorting
		},
		onColumnOrderChange: setColumnOrder,
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onColumnVisibilityChange: setColumnVisibility
	});

	const refreshData = () => {
		//console.info('refresh');
		options.update((prev) => ({
			...prev,
			data: defaultData
		}));
	};

	const rerender = () => {
		options.update((options) => ({
			...options,
			data: defaultData
		}));
	};

	var table = createSvelteTable(options);

	//svelte-dnd-action
	import { dndzone } from 'svelte-dnd-action';
	const flipDurationMs = 300;

	// Update items array to be an array of column objects
	let items = $table.getAllLeafColumns().map((column, index) => ({
		id: column.id,
		name: column.id,
		isVisible: column.getIsVisible() // Set initial visibility state based on column visibility
	}));

	function handleDndConsider(e: {
		detail: { items: { id: string; name: string; isVisible: boolean }[] };
	}) {
		items = e.detail.items;
	}

	function handleDndFinalize(e: {
		detail: { items: { id: string; name: string; isVisible: boolean }[] };
	}) {
		items = e.detail.items;

		// Update column Order based on new order
		const newOrder = {};
		items.forEach((item) => {
			newOrder[item.id] = item.isVisible;
		});

		// const randomizeColumns = () => {
		// 	$table.setColumnOrder((_updater) => $table.getAllLeafColumns().map((d) => d.id));
		// };

		items = items.map((item) => {
			return {
				...item,
				getToggleVisibilityHandler() {
					return () => {
						const newOrder = { ...$table.setColumnOrder() };
						newOrder[item.id] = !newOrder[item.id];
						$table.setColumnOrder(newOrder);
					};
				}
			};
		});
		$table.setColumnOrder(newOrder);

		console.log('table', $table.setColumnOrder);
		console.log('columnOrder2', columnOrder);
		columnOrder = newOrder;
		rerender();
		table = createSvelteTable(options);
	}

	// Add toggle Order function to each column object
	items = items.map((item) => {
		return {
			...item,
			getToggleVisibilityHandler() {
				return () => {
					const newOrder = { ...$table.setColumnOrder() };
					newOrder[item.id] = !newOrder[item.id];
					$table.setColumnVisibility(newOrder);
				};
			}
		};
	});
	console.log('columnOrder', columnOrder);
	console.log('items', items);
</script>

<div class="flex mr-1 align-centre mb-2">
	{#if !switchSideBar && $toggleLeftSidebar}
		<AnimatedHamburger />
	{/if}

	<h1 class={!$toggleLeftSidebar ? 'ml-2' : ''}>Media Gallery</h1>
</div>

<div class="flex items-center justify-center mt-2 gap-10 border-b border-surface-500">
	<!-- Display Grid / Table -->
	<div class="mr-2 flex flex-col p-2 text-center text-xs">
		<div class="flex p-2 divide-x divide-gray-500">
			<div
				class="px-2"
				on:click={() => {
					view = 'grid';
				}}
				on:keydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						view = 'grid';
					}
				}}
			>
				<iconify-icon
					icon="material-symbols:grid-view-rounded"
					height="40"
					style={`color: ${view === 'grid' ? 'white' : 'grey'}`}
				/>Grid
			</div>
			<div
				class="px-2"
				on:click={() => {
					view = 'table';
				}}
				on:keydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						view = 'table';
					}
				}}
			>
				<iconify-icon
					icon="material-symbols:list-alt-outline"
					height="40"
					style={`color: ${view === 'table' ? 'white' : 'grey'}`}
				/>Table
			</div>
		</div>
	</div>

	<!-- switch between small, medium, and large images -->
	<div class="mr-2 flex flex-col p-2 text-center text-xs">
		<div class=" flex p-2 divide-x divide-gray-500">
			<div
				class="px-2"
				on:click={() => {
					size = 'small';
				}}
				on:keydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						size = 'small';
					}
				}}
			>
				<iconify-icon
					icon="material-symbols:background-grid-small-sharp"
					height="40"
					style={`color: ${size === 'small' ? 'white' : 'grey'}`}
				/>Small
			</div>
			<div
				class="px-2"
				on:click={() => {
					size = 'medium';
				}}
				on:keydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						size = 'medium';
					}
				}}
			>
				<iconify-icon
					icon="material-symbols:grid-on-sharp"
					height="40"
					style={`color: ${size === 'medium' ? 'white' : 'grey'}`}
				/>Medium
			</div>
			<div
				class="px-2"
				on:click={() => {
					size = 'large';
				}}
				on:keydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						size = 'large';
					}
				}}
			>
				<iconify-icon
					icon="material-symbols:grid-view"
					height="40"
					style={`color: ${size === 'large' ? 'white' : 'grey'}`}
				/>Large
			</div>
		</div>
	</div>
</div>

{#if view === 'grid'}
	<div
		class={`grid grid-cols-${
			size === 'small' ? '3' : size === 'medium' ? '2' : '4'
		} mt-2 px-1 gap-4`}
	>
		<!-- {#each images as image} -->
		<div class="card rounded-sm shadow-2xl">
			<section class="p-4">
				<img
					class={`w-full h-full object-cover ${
						size === 'small' ? 'h-32' : size === 'medium' ? 'h-48' : 'h-64'
					}`}
					src="/SimpleCMS_Logo_Round.png"
					alt="alt"
				/>
			</section>

			<footer class="card-footer bg-surface-500 font-bold rounded-sm text-center text-white">
				SimpleCMS
			</footer>
		</div>
		<!-- {/each} -->
	</div>
{:else}
	<div class="p-2">
		<!-- refresh -->
		<div class="flex justify-center items-center gap-3 mb-4">
			<div>{$table.getRowModel().rows.length} Rows</div>
			<button on:click={() => rerender()}>Force Rerender</button>
			<button on:click={() => refreshData()}>Refresh Data</button>
		</div>

		<!-- chip column order -->
		<div class="flex flex-col text-center justify-center bg-surface-700 rounded-md">
			<div class="font-semibold">Drag & Drop columns & Click to hide</div>
			<!-- toggle all -->
			<!-- TODO place into section row will kill dnd action-->
			<label class="mr-3">
				<input
					checked={$table.getIsAllColumnsVisible()}
					on:change={(e) => {
						console.info($table.getToggleAllColumnsVisibilityHandler()(e));
					}}
					type="checkbox"
				/>{' '}
				{$LL.TANSTACK_Toggle()}
			</label>
			<section
				class="bg-surface-700 flex justify-center rounded-md p-2"
				use:dndzone={{ items, flipDurationMs }}
				on:consider={handleDndConsider}
				on:finalize={handleDndFinalize}
			>
				{#each items as item (item.id)}
					<div
						class="chip {$table.getIsAllColumnsVisible()
							? 'variant-filled-secondary'
							: 'variant-ghost-secondary'} flex justify-center items-center mr-2 w-100"
						animate:flip={{ duration: flipDurationMs }}
					>
						{#if $table.getIsAllColumnsVisible()}
							<span><iconify-icon icon="fa:check" /></span>
						{/if}
						<span class="capitalize ml-2">{item.name}</span>
					</div>
				{/each}
			</section>
		</div>
		<div class="flex flex-col md:flex-row md:flex-wrap md:items-center md:justify-center">
			<!-- toggle all -->
			<div class="flex items-center mb-2 md:mb-0 md:mr-4">
				<label>
					<input
						checked={$table.getIsAllColumnsVisible()}
						on:change={(e) => {
							console.info($table.getToggleAllColumnsVisibilityHandler()(e));
						}}
						type="checkbox"
					/>{' '}
					{$LL.TANSTACK_Toggle()}
				</label>

				<!-- Show/hide Columns via chips -->
				<div class="flex flex-wrap items-center justify-center">
					{#each $table.getAllLeafColumns() as column}
						<span
							class="chip {column.getIsVisible()
								? 'variant-filled-secondary'
								: 'variant-ghost-secondary'} mx-2 my-1"
							on:click={column.getToggleVisibilityHandler()}
							on:keypress
						>
							{#if column.getIsVisible()}<span><iconify-icon icon="fa:check" /></span>{/if}
							<span class="capitalize">{column.id}</span>
						</span>
					{/each}
				</div>
			</div>
		</div>

		<div class="table-container">
			<table class="table table-hover">
				<thead class="bg-surface-500">
					{#each $table.getHeaderGroups() as headerGroup}
						<tr class="divide-x">
							{#each headerGroup.headers as header}
								<th colSpan={header.colSpan} class="text-center">
									{#if !header.isPlaceholder}
										<div
											class:cursor-pointer={header.column.getCanSort()}
											class:select-none={header.column.getCanSort()}
											on:click={header.column.getToggleSortingHandler()}
										>
											<svelte:component
												this={flexRender(header.column.columnDef.header, header.getContext())}
											/>
											{{
												asc: ' 🔼',
												desc: ' 🔽'
											}[header.column.getIsSorted().toString()] ?? ''}
										</div>
									{/if}
								</th>
							{/each}
						</tr>
					{/each}
				</thead>
				<tbody>
					{#each $table.getRowModel().rows.slice(0, 20) as row}
						<tr>
							{#each row.getVisibleCells() as cell}
								<td>
									<svelte:component
										this={flexRender(cell.column.columnDef.cell, cell.getContext())}
									/>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/if}
