<!--
@file src/routes/(app)/config/accessManagement/WebsiteTokens.svelte
@component
**This component manages website tokens within the application's access management system**

@xample
<WebsiteTokens />

### Features
- Load and display website tokens and their associated permissions.
- Allow users to create, edit, and delete website tokens through a modal interface.
- Allow bulk deletion of selected website tokens.
- Display a skeleton.dev modal for creating or editing website tokens with an intuitive UI for selecting associated permissions.
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { toaster } from '@stores/store.svelte';
	import TablePagination from '@components/system/table/TablePagination.svelte';
	import TableFilter from '@components/system/table/TableFilter.svelte';
	// import { clipboard } from '@skeletonlabs/skeleton-svelte';
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { WebsiteToken } from '@src/databases/schemas';
	import type { User } from '@src/databases/auth/types';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';

	interface TableHeader {
		label: string;
		key: string;
		visible: boolean;
		id: string;
	}

	let tokens: WebsiteToken[] = $state([]);
	let users: User[] = $state([]);
	const userMap = $derived(new Map(users.map((u) => [u._id, u.username || u.email])));
	let newTokenName = $state('');

	// Filter state
	let globalSearchValue = $state('');
	let searchShow = $state(false);
	let filterShow = $state(false);
	let columnShow = $state(false);
	let density = $state('normal');
	let filters: Record<string, string | undefined> = $state({});

	// Sorting and Pagination
	let sorting = $state({ sortedBy: 'createdAt', isSorted: -1 }); // Sort by createdAt desc by default
	let currentPage = $state(1);
	let rowsPerPage = $state(10);
	let totalItems = $state(0);
	const pagesCount = $derived(Math.ceil(totalItems / rowsPerPage) || 1);

	const tableHeaders = [
		{ label: 'Name', key: 'name' },
		{ label: 'Token', key: 'token' },
		{ label: 'Created At', key: 'createdAt' },
		{ label: 'Created By', key: 'createdBy' }
	];

	// Column visibility
	let displayTableHeaders = $state(tableHeaders.map((h) => ({ ...h, visible: true, id: `header-${h.key}` })));
	let selectAllColumns = $state(true);

	function handleDndConsider(event: CustomEvent) {
		displayTableHeaders = event.detail.items;
	}

	function handleDndFinalize(event: CustomEvent) {
		displayTableHeaders = event.detail.items;
	}

	function handleCheckboxChange() {
		const allColumnsVisible = displayTableHeaders.every((header) => header.visible);
		displayTableHeaders = displayTableHeaders.map((header) => ({
			...header,
			visible: !allColumnsVisible
		}));
		selectAllColumns = !allColumnsVisible;
	}

	function handleInputChange(value: string, headerKey: string) {
		if (value) {
			filters = { ...filters, [headerKey]: value };
		} else {
			const newFilters = { ...filters };
			delete newFilters[headerKey];
			filters = newFilters;
		}
	}

	onMount(async () => {
		await Promise.all([fetchTokens(), fetchUsers()]);
	});

	async function fetchUsers() {
		// Capture current state of 'users' into a local variable (or object reference if updated within async block)
		const usersRef = { value: users };
		try {
			const response = await fetch('/api/admin/users');
			if (response.ok) {
				const result = await response.json();
				usersRef.value = result.data; // Update the referenced value
			} else {
				toaster.error({ description: 'Failed to fetch users' });
			}
		} catch (error) {
			toaster.error({ description: 'An error occurred while fetching users' });
		}
		// Assign back to the $state variable after async operation
		users = usersRef.value;
	}

	async function fetchTokens() {
		// Capture current state values into local variables for the async block
		const currentPageVal = currentPage;
		const rowsPerPageVal = rowsPerPage;
		const sortingVal = sorting;
		const globalSearchValueVal = globalSearchValue;
		const filtersVal = filters;
		const tokensRef = { value: tokens }; // Use an object to hold the reference for tokens
		const totalItemsRef = { value: totalItems }; // Use an object to hold the reference for totalItems

		await globalLoadingStore.withLoading(
			loadingOperations.tokenGeneration,
			async () => {
				const params = new URLSearchParams();
				params.set('page', String(currentPageVal));
				params.set('limit', String(rowsPerPageVal));
				params.set('sort', sortingVal.sortedBy);
				if (sortingVal.isSorted !== 0) {
					params.set('order', sortingVal.isSorted === 1 ? 'asc' : 'desc');
				}

				if (globalSearchValueVal) {
					params.set('search', globalSearchValueVal);
				}

				for (const [key, value] of Object.entries(filtersVal)) {
					if (value) {
						params.set(key, value);
					}
				}

				try {
					const response = await fetch(`/api/website-tokens?${params.toString()}`);
					if (response.ok) {
						const result = await response.json();
						tokensRef.value = result.data; // Assign to the ref's value
						totalItemsRef.value = result.pagination.totalItems; // Assign to the ref's value
					} else {
						toaster.error({ description: 'Failed to fetch tokens' });
					}
				} catch (error) {
					toaster.error({ description: 'An error occurred while fetching tokens' });
				}
			},
			'Fetching website tokens'
		);
		// Assign back to the $state variables after async operation
		tokens = tokensRef.value;
		totalItems = totalItemsRef.value;
	}
	async function generateToken() {
		const currentNewTokenName = newTokenName; // Capture current state
		if (!currentNewTokenName) {
			toaster.error({ description: 'Please enter a name for the token.' });
			return;
		}

		try {
			const response = await fetch('/api/website-tokens', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: currentNewTokenName })
			});

			if (response.ok) {
				await fetchTokens(); // Refetch to get the new token and update pagination
				toaster.success({ description: `Token generated for ${currentNewTokenName}` });
				newTokenName = ''; // Clear input
			} else {
				if (response.status === 409) {
					toaster.error({ description: 'A token with this name already exists' });
				} else {
					toaster.error({ description: 'Failed to generate token' });
				}
			}
		} catch (error) {
			toaster.error({ description: 'An error occurred while generating the token' });
		}
	}
	import { showConfirm } from '@utils/modalState.svelte';

	async function deleteToken(id: string, name: string) {
		showConfirm({
			title: 'Delete Token',
			body: `Are you sure you want to delete the token "${name}"? This action cannot be undone.`,
			onConfirm: async () => {
				try {
					const response = await fetch(`/api/website-tokens/${id}`, {
						method: 'DELETE'
					});

					if (response.ok) {
						await fetchTokens(); // Refetch to update the list
						toaster.success({ description: 'Token deleted.' });
					} else {
						toaster.error({ description: 'Failed to delete token' });
					}
				} catch (error) {
					toaster.error({ description: 'An error occurred while deleting the token' });
				}
			}
		});
	}

	$effect(() => {
		if (totalItems <= 1) return;
		void currentPage;
		void rowsPerPage;
		void sorting;
		fetchTokens();
	});
</script>

<div class="p-4">
	<h3 class="mb-2 text-center text-xl font-bold">Website Access Tokens</h3>
	<p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">
		Manage API tokens for external websites to access your content.
	</p>

	<div class="card mb-4">
		<div class="p-4">
			<h4 class="h4 mb-2 font-bold text-tertiary-500 dark:text-primary-500">Generate New Website Token</h4>
			<div class="flex gap-2">
				<input type="text" class="input" placeholder="Token Name" bind:value={newTokenName} />
				<button class="preset-filled-primary-500 btn" onclick={generateToken}>Generate</button>
			</div>
		</div>
	</div>

	<div class="card">
		<div class="p-4">
			<div class="my-4 flex flex-wrap items-center justify-between gap-1">
				<h4 class="h4 font-bold text-tertiary-500 dark:text-primary-500">Existing Tokens</h4>
				<div class="order-3 sm:order-2">
					<TableFilter {globalSearchValue} {searchShow} {filterShow} {columnShow} {density} />
				</div>
			</div>

			{#if columnShow}
				<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 text-center dark:bg-surface-700">
					<div class="text-white dark:text-primary-500">Drag and drop to reorder columns</div>
					<div class="my-2 flex w-full items-center justify-center gap-1">
						<label class="mr-2">
							<input type="checkbox" bind:checked={selectAllColumns} onchange={handleCheckboxChange} />
							All
						</label>

						<section
							use:dndzone={{ items: displayTableHeaders, flipDurationMs: 300 }}
							onconsider={handleDndConsider}
							onfinalize={handleDndFinalize}
							class="flex flex-wrap justify-center gap-1 rounded-md p-2"
						>
							{#each displayTableHeaders as header: TableHeader (header.id)}
								<button
									class="chip {header.visible
										? 'preset-filled-secondary-500'
										: 'preset-ghost-secondary-500'} w-100 mr-2 flex items-center justify-center"
									animate:flip={{ duration: 300 }}
									onclick={() => {
										displayTableHeaders = displayTableHeaders.map((h: TableHeader) => (h.id === header.id ? { ...h, visible: !h.visible } : h));
										selectAllColumns = displayTableHeaders.every((h: TableHeader) => h.visible);
									}}
								>
									{#if header.visible}
										<span><iconify-icon icon="fa:check"></iconify-icon></span>
									{/if}
									<span class="ml-2 capitalize">{header.label}</span>
								</button>
							{/each}
						</section>
					</div>
				</div>
			{/if}
			<div class="table-container">
				<table class="table">
					<thead>
						{#if filterShow}
							<tr class="divide-x divide-preset-400">
								<th></th>
								{#each displayTableHeaders.filter((header: TableHeader) => header.visible) as header (header.id)}
									<th>
										<input
											type="text"
											class="input"
											placeholder={`Filter by ${header.label}...`}
											oninput={(e) => handleInputChange(e.currentTarget.value, header.key)}
										/>
									</th>
								{/each}
								<th></th>
							</tr>
						{/if}
						<tr class="divide-x divide-preset-400 border-b border-black dark:border-white">
							{#each displayTableHeaders.filter((h: TableHeader) => h.visible) as header: TableHeader}
								<th
									onclick={() => {
										sorting = {
											sortedBy: header.key,
											isSorted: sorting.sortedBy === header.key ? (sorting.isSorted === 1 ? -1 : sorting.isSorted === -1 ? 0 : 1) : 1
										};
									}}
								>
									<div class="text-terriary-500 flex items-center justify-center text-center dark:text-primary-500">
										{header.label}
										<iconify-icon
											icon="material-symbols:arrow-upward-rounded"
											width="22"
											class="origin-center duration-300 ease-in-out"
											class:up={sorting.isSorted === 1 && sorting.sortedBy === header.key}
											class:invisible={sorting.isSorted === 0 || sorting.sortedBy !== header.key}
										></iconify-icon>
									</div>
								</th>
							{/each}
							<th class="text-terriary-500 text-center dark:text-primary-500">Action</th>
						</tr>
					</thead>
					<tbody>
						{#each tokens as token (token._id)}
							<tr>
								{#each displayTableHeaders.filter((h: TableHeader) => h.visible) as header: TableHeader}
									<td>
										{#if header.key === 'token'}
											<div class="flex items-center gap-2">
												<code>{token.token}</code>
												<button
													onclick={async () => {
														await navigator.clipboard.writeText(token.token);
														toaster.success({ description: 'Token copied to clipboard' });
													}}
													class="preset-ghost-surface-500 btn-icon btn-icon-sm"
													aria-label="Copy token to clipboard"
												>
													<iconify-icon icon="mdi:clipboard-outline" width="16"></iconify-icon>
												</button>
											</div>
										{:else if header.key === 'createdAt'}
											{new Date(token.createdAt).toLocaleDateString()}
										{:else if header.key === 'createdBy'}
											{userMap.get(token.createdBy) || token.createdBy}
										{:else}
											{token[header.key as keyof WebsiteToken]}
										{/if}
									</td>
								{/each}
								<td>
									<button class="preset-filled-error-500 btn btn-sm" onclick={() => deleteToken(token._id, token.name)}>Delete</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="flex justify-center">
				<div class="mt-2 flex flex-col items-center justify-center px-2 md:flex-row md:justify-between md:p-4">
					<TablePagination
						bind:currentPage
						bind:rowsPerPage
						{pagesCount}
						{totalItems}
						onUpdatePage={(page: number) => (currentPage = page)}
						onUpdateRowsPerPage={(rows: number) => {
							rowsPerPage = rows;
							currentPage = 1;
						}}
					/>
				</div>
			</div>
		</div>
	</div>
</div>
