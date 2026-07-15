<!--
@file src/routes/(app)/config/access-management/website-tokens.svelte
@component
**This component manages website tokens within the application's access management system**

@xample
<WebsiteTokens />

### Features
- Load and display website tokens and their associated permissions.
- Allow users to create, edit, and delete website tokens through a modal interface.
- Allow bulk deletion of selected website tokens.
- Display a native modal for creating or editing website tokens with an intuitive UI for selecting associated permissions.
-->

<script lang="ts">
import TableFilter from "@src/components/system/table/table-filter.svelte";
import TablePagination from "@src/components/system/table/table-pagination.svelte";
import type { Permission, User } from "@src/databases/auth/types";
import type { DatabaseId, WebsiteToken } from "@src/content/types";
import {
	globalLoadingStore,
	loadingOperations,
} from "@src/stores/loading-store.svelte.ts";
import { toast } from "@src/stores/toast.svelte.ts";
import { showConfirm } from "@utils/modal.svelte";
import { onMount } from "svelte";
import { flip } from "svelte/animate";
import { SvelteDate, SvelteURLSearchParams } from "svelte/reactivity";
import { dndzone } from "svelte-dnd-action";
	import AdminCard from '@components/admin-card.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';

interface TableHeader {
	id: string;
	key: string;
	label: string;
	visible: boolean;
}

let { permissions = [] }: { permissions: Permission[] } = $props();

let tokens: WebsiteToken[] = $state([]);
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
let selectedTokens = $state(new Set<string>());

let globalSearchValue = $state("");
let searchShow = $state(false);
let filterShow = $state(false);
let columnShow = $state(false);
let density = $state("normal");
let filters: Record<string, string | undefined> = $state({});

let sorting = $state({ sortedBy: "createdAt", isSorted: -1 });
let currentPage = $state(1);
let rowsPerPage = $state(10);
let totalItems = $state(0);
const pagesCount = $derived(Math.ceil(totalItems / rowsPerPage) || 1);

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

function handleDndConsider(event: CustomEvent) {
	displayTableHeaders = event.detail.items;
}

function handleDndFinalize(event: CustomEvent) {
	displayTableHeaders = event.detail.items;
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
	await Promise.all([fetchTokens(), fetchUsers()]);
});

async function fetchUsers() {
	const usersRef = { value: users };
	try {
		const response = await fetch("/api/user");
		if (response.ok) {
			const result = await response.json();
			usersRef.value = result.data;
		} else {
			toast.error("Failed to fetch users");
		}
	} catch {
		toast.error("An error occurred while fetching users");
	}
	users = usersRef.value;
}

async function fetchTokens() {
	const currentPageVal = currentPage;
	const rowsPerPageVal = rowsPerPage;
	const sortingVal = sorting;
	const globalSearchValueVal = globalSearchValue;
	const filtersVal = filters;
	const tokensRef = { value: tokens };
	const totalItemsRef = { value: totalItems };

	await globalLoadingStore.withLoading(
		loadingOperations.tokenGeneration,
		async () => {
			const params = new SvelteURLSearchParams();
			params.set("page", String(currentPageVal));
			params.set("limit", String(rowsPerPageVal));
			params.set("sort", sortingVal.sortedBy);
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
				const response = await fetch(
					`/api/website-tokens?${params.toString()}`,
				);
				if (response.ok) {
					const result = await response.json();
					tokensRef.value = result.data;
					totalItemsRef.value = result.pagination.totalItems;
				} else {
					toast.error("Failed to fetch tokens");
				}
			} catch {
				toast.error("An error occurred while fetching tokens");
			}
		},
		"Fetching website tokens",
	);
	tokens = tokensRef.value;
	totalItems = totalItemsRef.value;
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
		const response = await fetch("/api/website-tokens", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: currentNewTokenName,
				permissions: selectedPermissions,
				expiresAt: getExpirationDate(),
				tenantId: tenantScope === 'global' ? null : undefined,
			}),
		});

		if (response.ok) {
			await fetchTokens();
			toast.success(`Token generated for ${currentNewTokenName}`);
			newTokenName = "";
			selectedPermissions = [];
			expirationOption = "90d";
			tenantScope = "current";
		} else if (response.status === 409) {
			toast.error("A token with this name already exists");
		} else {
			toast.error("Failed to generate token");
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
				const response = await fetch(`/api/website-tokens/${id}`, {
					method: "DELETE",
				});

				if (response.ok) {
					await fetchTokens();
					toast.success("Token deleted.");
				} else {
					toast.error("Failed to delete token");
				}
			} catch {
				toast.error("An error occurred while deleting the token");
			}
		},
	});
}

async function bulkDeleteTokens() {
	if (selectedTokens.size === 0) return;

	showConfirm({
		title: "Bulk Delete Tokens",
		body: `Are you sure you want to delete ${selectedTokens.size} selected tokens? This action cannot be undone.`,
		onConfirm: async () => {
			await globalLoadingStore.withLoading(
				loadingOperations.tokenGeneration,
				async () => {
					try {
						const deletePromises = Array.from(selectedTokens).map((id) =>
							fetch(`/api/website-tokens/${id}`, { method: "DELETE" }),
						);
						const results = await Promise.all(deletePromises);

						const successCount = results.filter((r) => r.ok).length;
						if (successCount > 0) {
							toast.success(`${successCount} tokens deleted.`);
							selectedTokens.clear();
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
	if (selectedTokens.has(id)) {
		selectedTokens.delete(id);
	} else {
		selectedTokens.add(id);
	}
}

function toggleAllTokens() {
	if (selectedTokens.size === tokens.length) {
		selectedTokens.clear();
	} else {
		tokens.forEach((t) => selectedTokens.add(t._id));
	}
}

$effect(() => {
	if (totalItems <= 1) {
		return;
	}
	void currentPage;
	void rowsPerPage;
	void sorting;
	fetchTokens();
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
			<div class="my-4 flex flex-wrap items-center justify-between gap-1">
				<div class="flex items-center gap-4">
					<h4 class="h4 font-bold text-tertiary-500 dark:text-primary-500">Existing Tokens</h4>
					{#if selectedTokens.size > 0}
						<Button variant="error" onclick={bulkDeleteTokens} size="sm">
							Delete Selected ({selectedTokens.size})
						</Button>
					{/if}
				</div>
				<div class="order-3 sm:order-2"><TableFilter {globalSearchValue} {searchShow} {filterShow} {columnShow} {density} /></div>
			</div>

			{#if columnShow}
				<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b border-surface-200 bg-surface-100 text-center dark:border-surface-700 dark:bg-surface-800">
					<div class="text-surface-700 dark:text-surface-200">Drag and drop to reorder columns</div>
					<div class="my-2 flex w-full items-center justify-center gap-1">
						<Checkbox bind:checked={selectAllColumns} onchange={handleCheckboxChange} label="All" />

						<section
							use:dndzone={{ items: displayTableHeaders, flipDurationMs: 300 }}
							onconsider={handleDndConsider}
							onfinalize={handleDndFinalize}
							class="flex flex-wrap justify-center gap-1 rounded p-2"
						>
							{#each displayTableHeaders as header (header.id)}
								<div animate:flip={{ duration: 300 }}>
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

			<div class="overflow-x-auto w-full">
				<table class="w-full text-sm border-collapse">
					<thead>
						{#if filterShow}
							<tr class="border-b border-surface-200 dark:border-surface-800">
								<th class="px-2 py-2"></th>
								{#each displayTableHeaders.filter((header: TableHeader) => header.visible) as header (header.id)}
									<th class="px-2 py-2">
										<Input
											placeholder={`Filter by ${header.label}...`}
											oninput={(e) => handleInputChange((e.target as HTMLInputElement).value, header.key)}
											aria-label={`Filter by ${header.label}`}
										/>
									</th>
								{/each}
								<th class="px-2 py-2"></th>
							</tr>
						{/if}
						<tr class="border-b border-surface-200 dark:border-surface-800 text-start text-xs uppercase tracking-wider text-surface-400">
							<th class="w-10 px-2 py-3 text-center">
								<Checkbox
									checked={selectedTokens.size === tokens.length && tokens.length > 0}
									onchange={toggleAllTokens}
									label="Select all tokens"
									class="[&_label:last-of-type]:sr-only"
								/>
							</th>
							{#each displayTableHeaders.filter((h: TableHeader) => h.visible) as header (header.id)}
								<th class="px-2 py-3" aria-sort={sorting.sortedBy === header.key ? (sorting.isSorted === 1 ? 'ascending' : 'descending') : 'none'}>
									<button
										class="flex w-full items-center justify-center text-center font-bold text-tertiary-500 dark:text-primary-500"
										onclick={() => {
											sorting = {
												sortedBy: header.key,
												isSorted: sorting.sortedBy === header.key ? (sorting.isSorted === 1 ? -1 : sorting.isSorted === -1 ? 0 : 1) : 1
											};
										}}
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
							<th class="px-2 py-3 text-center font-bold text-tertiary-500 dark:text-primary-500" scope="col">Action</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-surface-100 dark:divide-surface-800/60">
						{#each tokens as token (token._id)}
							<tr class="text-surface-700 dark:text-surface-200 hover:bg-surface-50/40 dark:hover:bg-surface-900/30 {selectedTokens.has(token._id) ? 'bg-surface-50/60 dark:bg-surface-900/40' : ''}">
								<td class="px-2 py-3 text-center">
									<Checkbox
										checked={selectedTokens.has(token._id)}
										onchange={() => toggleTokenSelection(token._id)}
										label={`Select token ${token.name}`}
										class="[&_label:last-of-type]:sr-only"
									/>
								</td>
								{#each displayTableHeaders.filter((h: TableHeader) => h.visible) as header (header.id)}
									<td class="px-2 py-3">
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
								<td class="px-2 py-3"><Button variant="error" onclick={() => deleteToken(token._id, token.name)} size="sm">Delete</Button></td>
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
	</AdminCard>
</div>