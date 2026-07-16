<!--
@file src/components/ui/smart-table/smart-table-saved-views-menu.svelte
@component
**Saved views menu for Smart Table (filter/sort/layout presets).**

### Props
- `scope` (string): Storage scope (e.g. collection id).
- `getSnapshot` (): Capture current filters/search/sort/pageSize.
- `onApply` (view): Apply a saved view.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import {
		deleteSavedView,
		listSavedViews,
		saveView,
		type SmartTableSavedView
	} from '@utils/smart-table-saved-views';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { browser } from '$app/environment';

	let {
		scope,
		getSnapshot,
		onApply
	}: {
		scope: string;
		getSnapshot: () => Omit<SmartTableSavedView, 'id' | 'createdAt' | 'updatedAt' | 'name'> & {
			name?: string;
		};
		onApply: (view: SmartTableSavedView) => void;
	} = $props();

	let open = $state(false);
	let views = $state<SmartTableSavedView[]>([]);
	let saveName = $state('');

	function refresh() {
		if (!browser || !scope) {
			views = [];
			return;
		}
		views = listSavedViews(scope);
	}

	$effect(() => {
		void scope;
		refresh();
	});

	function handleSave() {
		const name = saveName.trim() || `View ${views.length + 1}`;
		const snap = getSnapshot();
		saveView(scope, {
			name,
			filters: snap.filters,
			search: snap.search,
			sort: snap.sort,
			pageSize: snap.pageSize,
			layout: snap.layout
		});
		saveName = '';
		refresh();
		toast.success(`Saved view “${name}”`);
	}

	function handleApply(view: SmartTableSavedView) {
		onApply(view);
		open = false;
		toast.success(`Applied “${view.name}”`);
	}

	function handleDelete(id: string, e: MouseEvent) {
		e.stopPropagation();
		deleteSavedView(scope, id);
		refresh();
	}
</script>

<div class="relative">
	<Button
		variant="outline"
		size="sm"
		type="button"
		aria-expanded={open}
		aria-haspopup="menu"
		aria-label="Saved table views"
		onclick={() => {
			open = !open;
			if (open) refresh();
		}}
		class="gap-1"
	>
		<iconify-icon icon="mdi:bookmark-outline" width={18}></iconify-icon>
		<span class="hidden sm:inline">Views</span>
		{#if views.length > 0}
			<span class="rounded-full bg-tertiary-500/15 px-1.5 text-[10px] font-bold dark:bg-primary-500/20">{views.length}</span>
		{/if}
	</Button>

	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute end-0 z-50 mt-1 w-64 rounded-lg border border-surface-200 bg-white p-2 shadow-lg dark:border-surface-700 dark:bg-surface-900"
			role="menu"
			aria-label="Saved views"
		>
			<div class="mb-2 flex gap-1">
				<input aria-label="New view name"
					type="text"
					class="input input-sm flex-1 rounded border border-surface-200 bg-surface-50 px-2 py-1 text-xs dark:border-surface-700 dark:bg-surface-800"
					placeholder="View name…"
					bind:value={saveName}
					onkeydown={(e) => {
						if (e.key === 'Enter') handleSave();
					}}
				/>
				<Button variant="primary" size="sm" type="button" onclick={handleSave} aria-label="Save current view">
					Save
				</Button>
			</div>

			{#if views.length === 0}
				<p class="px-1 py-3 text-center text-xs text-surface-500">No saved views yet.</p>
			{:else}
				<ul class="max-h-48 space-y-0.5 overflow-auto">
					{#each views as view (view.id)}
						<li>
							<button
								type="button"
								class="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-start text-xs hover:bg-surface-100 dark:hover:bg-surface-800"
								role="menuitem"
								onclick={() => handleApply(view)}
							>
								<span class="truncate font-medium">{view.name}</span>
								<span
									type="button"
									role="button"
									tabindex="0"
									class="shrink-0 rounded p-0.5 text-surface-400 hover:bg-error-500/10 hover:text-error-500 cursor-pointer"
									aria-label="Delete view {view.name}"
									onclick={(e) => handleDelete(view.id, e)}
									onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleDelete(view.id, e); } }}
								>
									<iconify-icon icon="mdi:close" width={14}></iconify-icon>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			<button
				type="button"
				class="mt-1 w-full rounded px-2 py-1 text-center text-[10px] text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800"
				onclick={() => (open = false)}
			>
				Close
			</button>
		</div>
	{/if}
</div>
