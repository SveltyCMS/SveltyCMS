<!--
@file src/routes/(app)/config/trash/+page.svelte
@component Global trash bin — browse and restore soft-deleted content.

### Features:
- Admin-only page gate
- SmartTableShell adoption: consistent table chrome, sorting, overflow, token-compliant empty/loading states
- showConfirm before restore
- Mutations via trash-api → fetchApi (CSRF automatic)
- Control-risk data-testids for E2E
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { adminFade } from '@utils/admin-transitions';
	import { toast } from '@src/stores/toast.svelte';
	import { showConfirm } from '@utils/modal.svelte';
	import { formatDateTime } from '@utils/format-date';
	import { formatTrashActor } from '@utils/trash-item';
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import SmartTableShell from '@components/ui/smart-table/smart-table-shell.svelte';
	import {
		SMART_TABLE,
		SMART_TABLE_ROW_HOVER,
		SMART_TABLE_TD,
		SMART_TABLE_TH,
		SMART_TABLE_THEAD
	} from '@components/ui/smart-table/chrome';
	import {
		button_refresh,
		trash_aria_refresh,
		trash_aria_restore,
		trash_empty_description,
		trash_empty_title,
		trash_load_failed,
		trash_page_description,
		trash_page_title,
		trash_restore_button,
		trash_restore_confirm_body,
		trash_restore_confirm_title,
		trash_restore_failed,
		trash_restore_success,
		trash_th_actions,
		trash_th_collection,
		trash_th_content,
		trash_th_deleted_at,
		trash_th_deleted_by
	} from '@src/paraglide/messages';
	import { listTrash, restoreTrashItem, unwrapTrashList, type TrashItem } from './trash-api';

	type SortField = 'content' | 'collection' | 'deletedAt' | 'deletedBy';
	type SortOrder = 'asc' | 'desc';

	let { data } = $props();

	let trashedItems = $state<TrashItem[]>(untrack(() => data.items));
	// Id → display name resolved server-side; refreshed rows reuse the map and fall
	// back to the raw id until the next load.
	const actorNames = $derived((data.actorNames ?? {}) as Record<string, string>);
	let isLoading = $state(false);
	let sortField = $state<SortField>('deletedAt');
	let sortOrder = $state<SortOrder>('desc');

	function toggleSort(field: SortField) {
		if (sortField === field) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortOrder = field === 'deletedAt' ? 'desc' : 'asc';
		}
	}

	const sortedItems = $derived.by(() => {
		const items = [...trashedItems];
		items.sort((a, b) => {
			let cmp = 0;
			switch (sortField) {
				case 'content': {
					const aVal = a.title || a.name || a._id;
					const bVal = b.title || b.name || b._id;
					cmp = aVal.localeCompare(bVal);
					break;
				}
				case 'collection': {
					const aVal = a.collectionName || a.collectionId;
					const bVal = b.collectionName || b.collectionId;
					cmp = aVal.localeCompare(bVal);
					break;
				}
				case 'deletedAt': {
					const aTime = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
					const bTime = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
					cmp = aTime - bTime;
					break;
				}
				case 'deletedBy': {
					const aVal = formatTrashActor(a.deletedBy, actorNames[a.deletedBy ?? '']);
					const bVal = formatTrashActor(b.deletedBy, actorNames[b.deletedBy ?? '']);
					cmp = aVal.localeCompare(bVal);
					break;
				}
			}
			return sortOrder === 'asc' ? cmp : -cmp;
		});
		return items;
	});

	async function loadTrash() {
		isLoading = true;
		const response = await listTrash();
		if (response.success) {
			trashedItems = unwrapTrashList(response);
		} else {
			toast.error(response.message || trash_load_failed());
		}
		isLoading = false;
	}

	function restoreItem(collectionId: string, entryId: string, label: string) {
		showConfirm({
			title: trash_restore_confirm_title(),
			body: trash_restore_confirm_body({ label }),
			onConfirm: async () => {
				const response = await restoreTrashItem(collectionId, entryId);

				if (response.success) {
					toast.success(trash_restore_success());
					await loadTrash();
				} else {
					toast.error(response.message || trash_restore_failed());
				}
			}
		});
	}
</script>

<AdminPageShell
	title={trash_page_title()}
	icon="mdi:trash-can-outline"
	description={trash_page_description()}
	showBackButton={true}
	backUrl="/config"
>
	{#snippet actions()}
		<Button
			variant="ghost"
			onclick={loadTrash}
			disabled={isLoading}
			leadingIcon="mdi:refresh"
			data-testid="trash-refresh"
			aria-label={trash_aria_refresh()}
		>
			{button_refresh()}
		</Button>
	{/snippet}

	<div data-testid="trash-page" class="contents">
		{#if isLoading}
			<div data-testid="trash-loading" class="contents">
				<AdminCard class="my-2 flex h-64 min-h-0 w-full flex-col sm:my-3">
					<SmartTableShell loading={true} />
				</AdminCard>
			</div>
		{:else}
			<div in:adminFade class="flex min-h-0 flex-1 flex-col">
				<AdminCard
					class="my-2 flex h-full min-h-0 w-full flex-col sm:my-3"
					data-testid="trash-table"
				>
					<SmartTableShell
						empty={sortedItems.length === 0}
						emptyTitle={trash_empty_title()}
						emptyDescription={trash_empty_description()}
						emptyIcon="mdi:trash-can-outline"
						showPagination={false}
					>
						{#snippet emptyAction()}
							<div data-testid="trash-empty" class="contents"></div>
						{/snippet}

						<table class={SMART_TABLE}>
							<thead class={SMART_TABLE_THEAD}>
								<tr
									class="border-b border-surface-500/30 text-xs uppercase tracking-wide dark:border-surface-600"
								>
									<th class="{SMART_TABLE_TH} text-center">
										<button
											type="button"
											class="inline-flex items-center gap-1 font-semibold tracking-wider hover:text-primary-500 focus:outline-none"
											onclick={() => toggleSort('content')}
										>
											{trash_th_content()}
											{#if sortField === 'content'}
												<iconify-icon
													icon={sortOrder === 'asc' ? 'mdi:arrow-up' : 'mdi:arrow-down'}
													class="text-primary-500"
												></iconify-icon>
											{/if}
										</button>
									</th>
									<th class="{SMART_TABLE_TH} text-center">
										<button
											type="button"
											class="inline-flex items-center gap-1 font-semibold tracking-wider hover:text-primary-500 focus:outline-none"
											onclick={() => toggleSort('collection')}
										>
											{trash_th_collection()}
											{#if sortField === 'collection'}
												<iconify-icon
													icon={sortOrder === 'asc' ? 'mdi:arrow-up' : 'mdi:arrow-down'}
													class="text-primary-500"
												></iconify-icon>
											{/if}
										</button>
									</th>
									<th class="{SMART_TABLE_TH} text-center">
										<button
											type="button"
											class="inline-flex items-center gap-1 font-semibold tracking-wider hover:text-primary-500 focus:outline-none"
											onclick={() => toggleSort('deletedAt')}
										>
											{trash_th_deleted_at()}
											{#if sortField === 'deletedAt'}
												<iconify-icon
													icon={sortOrder === 'asc' ? 'mdi:arrow-up' : 'mdi:arrow-down'}
													class="text-primary-500"
												></iconify-icon>
											{/if}
										</button>
									</th>
									<th class="{SMART_TABLE_TH} text-center">
										<button
											type="button"
											class="inline-flex items-center gap-1 font-semibold tracking-wider hover:text-primary-500 focus:outline-none"
											onclick={() => toggleSort('deletedBy')}
										>
											{trash_th_deleted_by()}
											{#if sortField === 'deletedBy'}
												<iconify-icon
													icon={sortOrder === 'asc' ? 'mdi:arrow-up' : 'mdi:arrow-down'}
													class="text-primary-500"
												></iconify-icon>
											{/if}
										</button>
									</th>
									<th class="{SMART_TABLE_TH} text-center">{trash_th_actions()}</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-surface-200/30 dark:divide-surface-700/30">
								{#each sortedItems as item (item._id)}
									<tr class={SMART_TABLE_ROW_HOVER} data-testid={`trash-row-${item._id}`}>
										<td class={SMART_TABLE_TD}>
											<span class="font-medium">{item.title || item.name || item._id}</span>
											<div class="text-xs opacity-50 font-mono">{item._id}</div>
										</td>
										<td class={SMART_TABLE_TD}>
											<Badge preset="tonal" color="secondary">{item.collectionName}</Badge>
										</td>
										<td class={SMART_TABLE_TD}>
											{formatDateTime(item.deletedAt, data.systemLanguage, undefined, '—')}
										</td>
										<td class={SMART_TABLE_TD}>
											{formatTrashActor(item.deletedBy, actorNames[item.deletedBy ?? ''])}
										</td>
										<td class={SMART_TABLE_TD}>
											<div class="flex items-center justify-center">
												<Button
													variant="tertiary"
													onclick={() =>
														restoreItem(
															item.collectionId,
															item._id,
															item.title || item.name || item._id
														)}
													size="sm"
													leadingIcon="mdi:restore"
													data-testid="trash-restore"
													aria-label={trash_aria_restore()}
												>
													{trash_restore_button()}
												</Button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</SmartTableShell>
				</AdminCard>
			</div>
		{/if}
	</div>
</AdminPageShell>
