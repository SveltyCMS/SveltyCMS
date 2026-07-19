<!--
@file src/routes/(app)/config/access-management/website-tokens.svelte
@component
**Website tokens access management — Smart Table server mode.**

### Features
- `createSmartTable({ mode: 'server', onQueryChange })` owns page/sort/selection
- API fetch for `/api/website-tokens` driven by one controller
- Shared table chrome (matches entry-list / users / media)
- Create / delete / bulk delete tokens + permission picker
-->

<script lang="ts">
import TableFilter from "@src/components/system/table/table-filter.svelte";
import TablePagination from "@src/components/system/table/table-pagination.svelte";
import {
	createSmartTable,
	pinCellClass,
	SMART_TABLE,
	SMART_TABLE_COLUMN_MANAGER,
	SMART_TABLE_PAGINATION_BAR,
	SMART_TABLE_ROW_HOVER,
	SMART_TABLE_ROW_SELECTED,
	SMART_TABLE_SCROLL,
	SMART_TABLE_TD,
	SMART_TABLE_TH,
	SMART_TABLE_THEAD,
	SMART_TABLE_TOOLBAR,
	type TableDensity,
} from "@components/ui/smart-table";
import SmartTableEmpty from "@components/ui/smart-table/smart-table-empty.svelte";
import type { Permission, User } from "@src/databases/auth/types";
import type { DatabaseId, WebsiteToken } from "@src/content/types";
import {
	globalLoadingStore,
	loadingOperations,
} from "@src/stores/loading-store.svelte.ts";
import { toast } from "@src/stores/toast.svelte.ts";
import { showConfirm } from "@utils/modal.svelte";
import { onMount, untrack } from "svelte";
import { flip } from "svelte/animate";
import { SvelteDate, SvelteURLSearchParams } from "svelte/reactivity";
import { draggable, droppable } from '@thisux/sveltednd';
import type { DragDropState } from '@thisux/sveltednd';
import AdminCard from "@components/admin-card.svelte";
import Badge from "@components/ui/badge.svelte";
import Button from "@components/ui/button.svelte";
import Checkbox from "@components/ui/checkbox.svelte";
import Input from "@components/ui/input.svelte";
import Select from "@components/ui/select.svelte";
import {
	listUsersForTokens,
	listWebsiteTokens,
	unwrapWebsiteTokensList,
	createWebsiteToken,
	deleteWebsiteTokenById,
	bulkDeleteWebsiteTokens as apiBulkDeleteWebsiteTokens,
} from "./website-tokens-api";

interface TableHeader {
	id: string;
	key: string;
	label: string;
	visible: boolean;
}

let { permissions = [] }: { permissions: Permission[] } = $props();

let users: User[] = $state([]);

const userMap = $derived(
	new Map(users.map((u) => [u._id, u.username || u.email])),
);

let newTokenName = $state("");
let selectedPermissions: string[] = $state([]);
let expirationOption = $state("90d");
let customExpirationDate = $state("");
let permissionSearchTerm = $state("");
let tenantScope = $state("current");

let showSecretMap: Record<string, boolean> = $state({});

let globalSearchValue = $state("");
let searchShow = $state(false);
let filterShow = $state(false);
let columnShow = $state(false);
let density = $state<TableDensity>("normal");
let filters: Record<string, string | undefined> = $state({});

/** Single controller: page/sort/selection drive API refetch (server mode). */
const smartTable = createSmartTable({
	mode: "server",
	pageSize: 10,
	layoutKey: "website-tokens-table",
	initialSort: { sortedBy: "createdAt", isSorted: -1 },
	getRowId: (row) => String((row as unknown as WebsiteToken)._id ?? ""),
	onQueryChange: () => {
		fetchTokens().catch(() => {});
	},
});

const tokens = $derived(smartTable.rows as unknown as WebsiteToken[]);
const totalItems = $derived(smartTable.pagination.totalItems);
const pagesCount = $derived(smartTable.pagination.pagesCount);
const currentPage = $derived(smartTable.pagination.currentPage);
const rowsPerPage = $derived(smartTable.pagination.pageSize);
const sorting = $derived(smartTable.sort);

	const tableHeaders = [
		{ label: "Name", key: "name" },
		{ label: "Token", key: "token" },
		{ label: "Scope", key: "tenantId" },
		{ label: "Expiration", key: "expiresAt" },
		{ label: "Created At", key: "createdAt" },
		{ label: "Created By", key: "createdBy" },
	];

	const expirationOptions = [
		{ value: '30d', label: '30 Days' },
		{ value: '90d', label: '90 Days' },
		{ value: '1y', label: '1 Year' },
		{ value: 'never', label: 'Never (Use with caution)' },
		{ value: 'custom', label: 'Custom Date' },
	];

	const tenantScopeOptions = [
		{ value: 'current', label: 'Current Tenant' },
		{ value: 'global', label: 'Global (all tenants)' },
	];

let displayTableHeaders = $state(
	tableHeaders.map((h) => ({ ...h, visible: true, id: `header-${h.key}` })),
);
let selectAllColumns = $state(true);

	function handleColumnDrop(state: DragDropState<TableHeader>) {
		const dragged = state.draggedItem;
		if (!dragged) return;

			const fromIndex = displayTableHeaders.indexOf(dragged);
			if (fromIndex < 0) return;
			const targetEl = state.targetElement?.closest('[data-header-id]') as HTMLElement | null;
			const targetHeaderId = targetEl?.dataset?.headerId;

			let targetIndex: number;
			if (targetHeaderId) {
				targetIndex = displayTableHeaders.findIndex(h => h.id === targetHeaderId);
				if (state.dropPosition === 'after') targetIndex++;
			} else {
				targetIndex = displayTableHeaders.length;
			}
					targetIndex = Math.max(0, Math.min(targetIndex, displayTableHeaders.length));

			if (fromIndex === targetIndex) return;
		displayTableHeaders = untrack(() =>
			displayTableHeaders.toSpliced(fromIndex, 1).toSpliced(targetIndex, 0, dragged)
		);
	}

const filteredAvailablePermissions = $derived(
	permissions.filter(
		(p) =>
			p.name.toLowerCase().includes(permissionSearchTerm.toLowerCase()) ||
			p.action.toLowerCase().includes(permissionSearchTerm.toLowerCase()),
	),
);

function handleCheckboxChange() {
	const allColumnsVisible = displayTableHeaders.every(
		(header) => header.visible,
	);
	displayTableHeaders = displayTableHeaders.map((header) => ({
		...header,
		visible: !allColumnsVisible,
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

function toggleSelectAllPermissions() {
	if (selectedPermissions.length === permissions.length) {
		selectedPermissions = [];
	} else {
		selectedPermissions = permissions.map((p) => p._id);
	}
}

onMount(async () => {
	// Tokens load via smartTable query effect / initial search effect
	await fetchUsers();
});

async function fetchUsers() {
	try {
		const list = await listUsersForTokens();
		if (list.length === 0) {
			// Empty is valid; only toast when API clearly failed (success false path returns [])
			users = [];
			return;
		}
		users = list;
	} catch {
		toast.error("An error occurred while fetching users");
	}
}

async function fetchTokens() {
	const pageVal = smartTable.pagination.currentPage;
	const pageSizeVal = smartTable.pagination.pageSize;
	const sortingVal = smartTable.sort;
	const globalSearchValueVal = globalSearchValue;
	const filtersVal = filters;

	await globalLoadingStore.withLoading(
		loadingOperations.tokenGeneration,
		async () => {
			const params = new SvelteURLSearchParams();
			params.set("page", String(pageVal));
			params.set("limit", String(pageSizeVal));
			params.set("sort", sortingVal.sortedBy || "createdAt");
			if (sortingVal.isSorted !== 0) {
				params.set("order", sortingVal.isSorted === 1 ? "asc" : "desc");
			}

			if (globalSearchValueVal) {
				params.set("search", globalSearchValueVal);
			}

			for (const [key, value] of Object.entries(filtersVal)) {
				if (value) {
					params.set(key, value);
				}
			}

			try {
				const result = await listWebsiteTokens(params);
				if (result.success) {
					const { items, totalItems } = unwrapWebsiteTokensList(result);
					smartTable.setRows(items as unknown as Record<string, unknown>[]);
					smartTable.setPaginationMeta({
						totalItems,
						pagesCount: Math.max(1, Math.ceil(totalItems / pageSizeVal)),
						currentPage: pageVal,
						pageSize: pageSizeVal,
					});
				} else {
					toast.error("Failed to fetch tokens");
					smartTable.setRows([]);
					smartTable.setPaginationMeta({ totalItems: 0, pagesCount: 1 });
				}
			} catch {
				toast.error("An error occurred while fetching tokens");
				smartTable.setRows([]);
			}
		},
		"Fetching website tokens",
	);
}

function getExpirationDate(): string | null {
	if (expirationOption === "never") {
		return null;
	}
	if (expirationOption === "custom") {
		return customExpirationDate
			? new SvelteDate(customExpirationDate).toISOString()
			: null;
	}

	const now = new SvelteDate();
	switch (expirationOption) {
		case "30d":
			now.setDate(now.getDate() + 30);
			break;
		case "90d":
			now.setDate(now.getDate() + 90);
			break;
		case "1y":
			now.setFullYear(now.getFullYear() + 1);
			break;
	}
	return now.toISOString();
}

function togglePermission(permissionId: string) {
	if (selectedPermissions.includes(permissionId)) {
		selectedPermissions = selectedPermissions.filter(
			(id) => id !== permissionId,
		);
	} else {
		selectedPermissions = [...selectedPermissions, permissionId];
	}
}

async function generateToken() {
	const currentNewTokenName = newTokenName;
	if (!currentNewTokenName) {
		toast.error("Please enter a name for the token.");
		return;
	}

	try {
		const response = await createWebsiteToken({
			name: currentNewTokenName,
			permissions: selectedPermissions,
			expiresAt: getExpirationDate(),
			tenantId: tenantScope === "global" ? null : undefined,
		});

		if (response.success) {
			await fetchTokens();
			toast.success(`Token generated for ${currentNewTokenName}`);
			newTokenName = "";
			selectedPermissions = [];
			expirationOption = "90d";
			tenantScope = "current";
		} else if (response.code === "HTTP_409" || /exist/i.test(response.message || "")) {
			toast.error("A token with this name already exists");
		} else {
			toast.error(response.message || "Failed to generate token");
		}
	} catch {
		toast.error("An error occurred while generating the token");
	}
}

async function deleteToken(id: string, name: string) {
	showConfirm({
		title: "Delete Token",
		body: `Are you sure you want to delete the token "${name}"? This action cannot be undone.`,
		onConfirm: async () => {
			try {
				const response = await deleteWebsiteTokenById(id);
				if (response.success) {
					await fetchTokens();
					toast.success("Token deleted.");
				} else {
					toast.error(response.message || "Failed to delete token");
				}
			} catch {
				toast.error("An error occurred while deleting the token");
			}
		},
	});
}

async function bulkDeleteTokens() {
	const ids = smartTable.getSelectedIds();
	if (ids.length === 0) return;

	showConfirm({
		title: "Bulk Delete Tokens",
		body: `Are you sure you want to delete ${ids.length} selected tokens? This action cannot be undone.`,
		onConfirm: async () => {
			await globalLoadingStore.withLoading(
				loadingOperations.tokenGeneration,
				async () => {
					try {
						const { successCount } = await apiBulkDeleteWebsiteTokens(ids.map(String));
						if (successCount > 0) {
							toast.success(`${successCount} tokens deleted.`);
							smartTable.clearSelection();
							await fetchTokens();
						} else {
							toast.error("Failed to delete selected tokens");
						}
					} catch {
						toast.error("An error occurred during bulk deletion");
					}
				},
				"Deleting multiple tokens",
			);
		},
	});
}

function toggleTokenSelection(id: string) {
	smartTable.toggleSelect(id);
}

function toggleAllTokens() {
	smartTable.setSelectAll(!smartTable.allSelected);
}

// Search / column filters → reset page + refetch (sort/page go through smartTable.onQueryChange)
$effect(() => {
	void globalSearchValue;
	void filters;
	untrack(() => {
		smartTable.setPaginationMeta({ currentPage: 1 });
		fetchTokens().catch(() => {});
	});
});

$effect(() => {
	smartTable.setDensity(density);
	smartTable.setColumns(
		displayTableHeaders.map((h) => ({
			key: h.key,
			label: h.label,
			sortable: true,
			visible: h.visible,
		})),
	);
});
</script>

<div class="space-y-4">
	<h3 class="mb-2 text-center text-xl font-bold">Website Access Tokens</h3>
	<p class="mb-4 justify-center text-center text-sm text-surface-500 dark:text-surface-400">
		Manage API tokens for external websites to access your content.
	</p>

	<AdminCard class="mb-4 border border-surface-200 dark:border-surface-800">
		<div class="p-4 space-y-4">
			<h4 class="h4 mb-2 font-bold text-tertiary-500 dark:text-primary-500">Generate New Website Token</h4>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<Input
					label="Token Name"
					placeholder="e.g. Production Website"
					bind:value={newTokenName}
				/>

				<div class="flex flex-col gap-2">
					<Select
						label="Tenant Scope"
						bind:value={tenantScope}
						options={tenantScopeOptions}
					/>
					<Select
						label="Expiration"
						bind:value={expirationOption}
						options={expirationOptions}
					/>
					{#if expirationOption === 'custom'}
						<Input label="Custom Date" type="date" bind:value={customExpirationDate} />
					{/if}
				</div>
			</div>

			<div class="mt-4">
				<div class="mb-2 flex items-center justify-between">
					<h5 class="h5 font-bold">Permissions</h5>
					<div class="flex items-center gap-4">
						<Input
							placeholder="Search permissions..."
							bind:value={permissionSearchTerm}
							aria-label="Search available permissions"
							class="max-w-xs"
						/>
						<Button variant="surface" onclick={toggleSelectAllPermissions} size="sm">
							{selectedPermissions.length === permissions.length ? 'Deselect All' : 'Select All'}
						</Button>
					</div>
				</div>
				<AdminCard
					class="max-h-60 overflow-y-auto p-4 border border-surface-200 dark:border-surface-800 bg-surface-50/30 dark:bg-surface-900/20"
					role="group"
					aria-labelledby="permissions-title"
				>
					<p id="permissions-title" class="text-sm text-surface-500 mb-2">
						Select permissions to grant to this token. If none selected, the token will have <strong>Read Only</strong> access.
					</p>

					{#if filteredAvailablePermissions.length > 0}
						<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
							{#each filteredAvailablePermissions as permission (permission._id)}
								<div class="p-2 rounded hover:bg-surface-200 dark:hover:bg-surface-700">
									<Checkbox
										checked={selectedPermissions.includes(permission._id)}
										onchange={() => togglePermission(permission._id)}
										label={permission.name}
										description={permission.action}
									/>
								</div>
							{/each}
						</div>
					{:else}
						<div class="text-xs text-center p-4 italic opacity-50">No permissions match your search.</div>
					{/if}
				</AdminCard>
			</div>

			<div class="mt-4 flex justify-end">
				<Button variant="tertiary" onclick={generateToken} class="dark:" leadingIcon="mdi:key-plus">
					Generate Token
				</Button>
			</div>
		</div>
	</AdminCard>

	<AdminCard class="border border-surface-200 dark:border-surface-800">
		<div class="p-4">
			<div class={SMART_TABLE_TOOLBAR}>
				<div class="flex items-center gap-4">
					<h4 class="h4 font-bold text-tertiary-500 dark:text-primary-500">Existing Tokens</h4>
					{#if smartTable.selectedCount > 0}
						<Button variant="error" onclick={bulkDeleteTokens} size="sm">
							Delete Selected ({smartTable.selectedCount})
						</Button>
					{/if}
				</div>
				<div class="order-3 sm:order-2">
					<TableFilter
						bind:globalSearchValue
						bind:searchShow
						bind:filterShow
						bind:columnShow
						bind:density
					/>
				</div>
			</div>

			{#if columnShow}
				<div class={SMART_TABLE_COLUMN_MANAGER}>
					<div class="text-sm text-surface-700 dark:text-surface-200">Drag and drop to reorder columns</div>
					<div class="my-2 flex w-full items-center justify-center gap-1">
						<Checkbox bind:checked={selectAllColumns} onchange={handleCheckboxChange} label="All" />

						<section
							use:droppable={{
								container: 'columns',
								callbacks: { onDrop: handleColumnDrop },
								direction: 'horizontal',
							}}
							class="flex flex-wrap justify-center gap-1 rounded p-2"
							role="list"
							aria-label="Drag columns to reorder"
						>
							{#each displayTableHeaders as header (header.id)}
								<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
								<div animate:flip={{ duration: 300 }} use:draggable={{ container: 'columns', dragData: header, keyboard: true }} use:droppable={{ container: 'columns', callbacks: { onDrop: handleColumnDrop }, direction: 'horizontal', attributes: { dragOverClass: 'bg-secondary-200' } }} data-header-id={header.id} role="listitem" tabindex="0">
									<Button variant="secondary"
										onclick={() => {
											displayTableHeaders = displayTableHeaders.map((h: TableHeader) => (h.id === header.id ? { ...h, visible: !h.visible } : h));
											selectAllColumns = displayTableHeaders.every((h: TableHeader) => h.visible);
										}}
									 class="chip w-100 me-2 flex items-center justify-center">
										{#if header.visible}
											<span><iconify-icon icon="fa:check" width={24}></iconify-icon></span>
										{/if}
										<span class="ms-2 capitalize">{header.label}</span>
									</Button>
								</div>
							{/each}
						</section>
					</div>
				</div>
			{/if}

			<div class="{SMART_TABLE_SCROLL} w-full">
				{#if tokens.length === 0}
					<SmartTableEmpty
						title="No website tokens"
						description="Generate a token above to allow external sites to access your content."
						icon="mdi:key-outline"
					/>
				{:else}
				<table class={SMART_TABLE}>
					<thead class={SMART_TABLE_THEAD}>
						{#if filterShow}
							<tr class="border-b border-surface-200 dark:border-surface-800">
								<th class={SMART_TABLE_TH}></th>
								{#each displayTableHeaders.filter((header: TableHeader) => header.visible) as header (header.id)}
									<th class={SMART_TABLE_TH}>
										<Input
											placeholder={`Filter by ${header.label}...`}
											oninput={(e) => handleInputChange((e.target as HTMLInputElement).value, header.key)}
											aria-label={`Filter by ${header.label}`}
										/>
									</th>
								{/each}
								<th class={SMART_TABLE_TH}></th>
							</tr>
						{/if}
						<tr class="border-b border-surface-300 text-xs uppercase tracking-wide dark:border-surface-600">
							<th class="{SMART_TABLE_TH} {pinCellClass('start')} w-10">
								<Checkbox
									checked={smartTable.allSelected}
									onchange={toggleAllTokens}
									label="Select all tokens"
									class="[&_label:last-of-type]:sr-only"
								/>
							</th>
							{#each displayTableHeaders.filter((h: TableHeader) => h.visible) as header (header.id)}
								<th
									class="{SMART_TABLE_TH} cursor-pointer"
									aria-sort={sorting.sortedBy === header.key ? (sorting.isSorted === 1 ? 'ascending' : 'descending') : 'none'}
								>
									<button
										class="flex w-full items-center justify-center text-center font-bold text-tertiary-500 dark:text-primary-500"
										onclick={() => smartTable.setSort(header.key)}
										aria-label={`Sort by ${header.label}`}
									>
										{header.label}
										{#if sorting.sortedBy === header.key && sorting.isSorted !== 0}
											<iconify-icon
												icon={sorting.isSorted === 1 ? 'material-symbols:arrow-upward-rounded' : 'material-symbols:arrow-downward-rounded'}
												width={22}
												class="ms-1 origin-center duration-300 ease-in-out"
												aria-hidden="true"
											></iconify-icon>
										{/if}
									</button>
								</th>
							{/each}
							<th class="{SMART_TABLE_TH} {pinCellClass('end')}" scope="col">Action</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-surface-200/30 dark:divide-surface-700/30">
						{#each tokens as token (token._id)}
							<tr
								class="text-surface-700 dark:text-surface-200 {smartTable.isSelected(token._id)
									? SMART_TABLE_ROW_SELECTED
									: SMART_TABLE_ROW_HOVER}"
							>
								<td class="{SMART_TABLE_TD} {pinCellClass('start')}">
									<Checkbox
										checked={smartTable.isSelected(token._id)}
										onchange={() => toggleTokenSelection(token._id)}
										label={`Select token ${token.name}`}
										class="[&_label:last-of-type]:sr-only"
									/>
								</td>
								{#each displayTableHeaders.filter((h: TableHeader) => h.visible) as header (header.id)}
									<td class={SMART_TABLE_TD}>
										{#if header.key === 'token'}
											<div class="flex items-center gap-2">
												<code class="bg-surface-100 dark:bg-surface-800 px-2 py-1 rounded">
													{showSecretMap[token._id] ? token.token : `${token.token.slice(0, 4)}••••••••${token.token.slice(-4)}`}
												</code>
												<div class="flex gap-1" aria-live="polite">
													<Button variant="surface"
														onclick={() => (showSecretMap[token._id] = !showSecretMap[token._id])}
														aria-label={showSecretMap[token._id] ? 'Hide token' : 'Show token'}
													 class="p-0! min-w-0">
														<iconify-icon icon={showSecretMap[token._id] ? 'mdi:eye-off-outline' : 'mdi:eye-outline'} width={20}></iconify-icon>
													</Button>
													<Button variant="surface"
														onclick={async () => {
															await navigator.clipboard.writeText(token.token);
															toast.success('Token copied to clipboard');
														}}
														aria-label="Copy token to clipboard"
													 class="p-0! min-w-0">
														<iconify-icon icon="mdi:clipboard-outline" width={20}></iconify-icon>
													</Button>
												</div>
											</div>
										{:else if header.key === 'createdAt'}
											{new Date(token.createdAt).toLocaleDateString()}
										{:else if header.key === 'expiresAt'}
											{#if token.expiresAt}
												{const daysLeft = Math.ceil((new Date(token.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}
												<span class={daysLeft < 7 && daysLeft > 0 ? 'text-warning-500 font-bold' : daysLeft <= 0 ? 'text-error-500 font-bold' : ''}>
													{new Date(token.expiresAt).toLocaleDateString()}
													{#if daysLeft < 0}
														(Expired)
													{/if}
												</span>
											{:else}
												<span class="opacity-50">Never</span>
											{/if}
										{:else if header.key === 'tenantId'}
											{#if token.tenantId}
												<span class="text-xs">Current Tenant</span>
											{:else}
												<Badge variant="secondary" class="text-xs">Global</Badge>
											{/if}
										{:else if header.key === 'createdBy'}
											{userMap.get(token.createdBy as DatabaseId) || token.createdBy}
										{:else}
											{token[header.key as keyof WebsiteToken]}
										{/if}
									</td>
								{/each}
								<td class="{SMART_TABLE_TD} {pinCellClass('end')}">
									<Button variant="error" onclick={() => deleteToken(token._id, token.name)} size="sm">Delete</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				{/if}
			</div>
			{#if tokens.length > 0}
			<div class={SMART_TABLE_PAGINATION_BAR}>
				<TablePagination
					currentPage={currentPage}
					rowsPerPage={rowsPerPage}
					{pagesCount}
					{totalItems}
					rowsPerPageOptions={[10, 25, 50, 100, 500]}
					onUpdatePage={(page: number) => smartTable.setPage(page)}
					onUpdateRowsPerPage={(rows: number) => smartTable.setPageSize(rows)}
				/>
			</div>
			{/if}
		</div>
	</AdminCard>
</div>