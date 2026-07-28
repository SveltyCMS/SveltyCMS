<!--
@file src/routes/(app)/config/trash/+page.svelte
@component Global trash bin — browse and restore soft-deleted content.

### Features:
- Admin-only page gate
- showConfirm before restore
- Mutations via trash-api → fetchApi (CSRF automatic)
- Control-risk data-testids for E2E
-->
<script lang="ts">
import { fly } from "svelte/transition";
import { onMount } from "svelte";
import { toast } from "@src/stores/toast.svelte";
import { showConfirm } from "@utils/modal.svelte";
import { formatDisplayDate } from "@utils/date";
import Badge from "@components/ui/badge.svelte";
import Button from "@components/ui/button.svelte";
import Loader from "@components/ui/loader.svelte";
import AdminCard from "@components/admin-card.svelte";
import AdminPageShell from "@components/admin-page-shell.svelte";
import {
	listTrash,
	restoreTrashItem,
	unwrapTrashList,
	type TrashItem,
} from "./trash-api";

let trashedItems = $state<TrashItem[]>([]);
let isLoading = $state(true);

async function loadTrash() {
	isLoading = true;
	const response = await listTrash();
	if (response.success) {
		trashedItems = unwrapTrashList(response);
	} else {
		toast.error(response.message || "Failed to load trash");
	}
	isLoading = false;
}

function restoreItem(collectionId: string, entryId: string, label: string) {
	showConfirm({
		title: "Restore Item",
		body: `Restore <strong>${label}</strong> to its collection?`,
		onConfirm: async () => {
			const response = await restoreTrashItem(collectionId, entryId);

			if (response.success) {
				toast.success("Item restored successfully");
				await loadTrash();
			} else {
				toast.error(response.message || "Failed to restore item");
			}
		},
	});
}

onMount(loadTrash);
</script>

<AdminPageShell
	title="Global Trash Bin"
	icon="mdi:delete-outline"
	description="Browse and restore soft-deleted content from all collections"
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
			aria-label="Refresh trash"
		>
			Refresh
		</Button>
	{/snippet}

	<div data-testid="trash-page" class="contents">
		{#if isLoading}
			<AdminCard
				class="flex h-64 items-center justify-center border border-surface-200 bg-white p-6 dark:border-surface-800 dark:bg-surface-900/40"
				data-testid="trash-loading"
			>
				<Loader variant="text" lines={2} lastLineWidth="40%" ariaLabel="Loading trash" />
			</AdminCard>
		{:else if trashedItems.length === 0}
			<div in:fly={{ y: 20, delay: 100 }}>
				<AdminCard
					class="p-12 text-center border-dashed border-2 border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs"
					data-testid="trash-empty"
				>
					<iconify-icon icon="mdi:trash-can-outline" width="64" class="mx-auto mb-4 opacity-20"></iconify-icon>
					<h3 class="text-xl font-semibold">Your trash is empty</h3>
					<p class="text-surface-500">Deleted items will appear here for 30 days.</p>
				</AdminCard>
			</div>
		{:else}
			<div in:fly={{ y: 20, delay: 100 }}>
				<AdminCard
					class="p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs"
					data-testid="trash-table"
				>
					<div class="overflow-x-auto w-full">
						<table class="w-full text-sm border-collapse">
							<thead>
								<tr
									class="border-b border-surface-200 dark:border-surface-800 text-start text-xs uppercase tracking-wider text-surface-400"
								>
									<th class="pb-3 font-semibold">Content</th>
									<th class="pb-3 font-semibold">Collection</th>
									<th class="pb-3 font-semibold">Deleted At</th>
									<th class="pb-3 font-semibold">Deleted By</th>
									<th class="pb-3 font-semibold text-end">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-surface-100 dark:divide-surface-800/60">
								{#each trashedItems as item (item._id)}
									<tr
										class="text-surface-700 dark:text-surface-200 hover:bg-surface-50/40 dark:hover:bg-surface-900/30"
										data-testid={`trash-row-${item._id}`}
									>
										<td class="py-3">
											<span class="font-medium">{item.title || item.name || item._id}</span>
											<div class="text-xs opacity-50 font-mono">{item._id}</div>
										</td>
										<td class="py-3">
											<Badge preset="tonal" color="secondary">{item.collectionName}</Badge>
										</td>
										<td class="py-3">{formatDisplayDate(item.deletedAt || "")}</td>
										<td class="py-3">{item.deletedBy || "System"}</td>
										<td class="py-3 text-end">
											<Button
												variant="tertiary"
												onclick={() =>
													restoreItem(
														item.collectionId,
														item._id,
														item.title || item.name || item._id,
													)}
												size="sm"
												leadingIcon="mdi:restore"
												data-testid="trash-restore"
												aria-label="Restore item"
											>
												Restore
											</Button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</AdminCard>
			</div>
		{/if}
	</div>
</AdminPageShell>
