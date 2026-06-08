<!-- 
@file src/widgets/core/relation/relation-modal.svelte
@component
**Premium Relation Selection Modal**

Provides a sleek, searchable, and deduplicated UI for selecting related entries.
Optimized with Svelte 5 runes for sub-millisecond reactivity.

### Props
- `collectionID` (string): The target collection to select from.
- `displayField` (string): The field to show as the label for entries.
- `multiple` (boolean): Whether to allow multiple selection.
- `selectedIds` (string[]): Currently selected IDs.
-->

<script lang="ts">
	import { slide, fade } from 'svelte/transition';
	import { modalState } from '@utils/modal.svelte';
	import FloatingInput from '@components/ui/floating-input.svelte';
	import { button_cancel, button_save } from '@src/paraglide/messages';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { onMount } from 'svelte';

	interface Props {
		collectionID: string;
		displayField: string;
		multiple?: boolean;
		selectedIds?: string[];
	}

	let { 
		collectionID, 
		displayField, 
		multiple = false, 
		selectedIds = [] 
	}: Props = $props();

	// State
	let searchQuery = $state('');
	let entries = $state<any[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selected = $state<Set<string>>(new Set());

	// Sync initial selection
	$effect(() => {
		selected = new Set(selectedIds);
	});

	// Deduplicated and Filtered Entries
	const filteredEntries = $derived.by(() => {
		const uniqueMap = new Map();
		const result = [];
		const term = searchQuery.toLowerCase().trim();

		for (const entry of entries) {
			const id = entry._id || entry.id;
			if (id && !uniqueMap.has(id.toString())) {
				uniqueMap.set(id.toString(), true);

				// Search filter
				const label = entry[displayField] || id.toString();
				if (!term || label.toString().toLowerCase().includes(term)) {
					result.push(entry);
				}
			}
		}
		return result;
	});

	// Fetch entries on mount
	onMount(async () => {
		await fetchEntries();
	});

	async function fetchEntries() {
		loading = true;
		error = null;
		try {
			// Fetch from the collection API
			const res = await fetch(`/api/collections/${collectionID}?limit=100`);
			const result = await res.json();

			if (res.ok && result.success) {
				entries = result.data || [];
			} else {
				throw new Error(result.message || 'Failed to load entries');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred while fetching entries';
			toast.error({ description: error });
		} finally {
			loading = false;
		}
	}

	function toggleSelection(id: string) {
		const idStr = id.toString();
		if (multiple) {
			const next = new Set(selected);
			if (next.has(idStr)) {
				next.delete(idStr);
			} else {
				next.add(idStr);
			}
			selected = next;
		} else {
			// Single selection logic
			if (selected.has(idStr)) {
				selected = new Set();
			} else {
				selected = new Set([idStr]);
			}
		}
	}

	function handleSave() {
		const result = Array.from(selected);
		modalState.close(result);
	}

	function handleCancel() {
		modalState.close();
	}
</script>

<div class="relation-modal flex flex-col gap-6 p-2 text-surface-900 dark:text-white max-h-[80vh] w-full max-w-2xl overflow-hidden" in:fade={{ duration: 200 }}>
	<!-- Header -->
	<header class="flex items-center justify-between border-b border-surface-500/20 pb-4">
		<div class="flex flex-col gap-1">
			<h3 class="text-xl font-bold tracking-tight">Select Related Entries</h3>
			<p class="text-sm opacity-60">Collection: <span class="font-mono text-tertiary-500 dark:text-primary-500">{collectionID}</span></p>
		</div>
		<div class="hidden sm:flex items-center gap-2">
			{#if selected.size > 0}
				<span class="chip preset-tonal-tertiary" transition:slide={{ axis: 'x', duration: 200 }}>
					{selected.size} selected
				</span>
			{/if}
		</div>
	</header>

	<!-- Search -->
	<div class="search-area">
		<FloatingInput
			type="text"
			label="Search entries..."
			bind:value={searchQuery}
			icon="mdi:magnify"
			placeholder="Type to filter..."
			textColor="text-surface-700 dark:text-white"
		/>
	</div>

	<!-- List -->
	<div class="list-container relative flex-1 min-h-[300px] overflow-y-auto rounded-xl border border-surface-500/20 bg-surface-50/50 p-2 dark:bg-surface-900/50">
		{#if loading}
			<div class="flex h-full items-center justify-center py-12" in:fade>
				<div class="flex flex-col items-center gap-4">
					<iconify-icon icon="line-md:loading-twotone-loop" width="48" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					<span class="text-sm font-medium animate-pulse">Fetching collection data...</span>
				</div>
			</div>
		{:else if error}
			<div class="flex h-full items-center justify-center py-12 text-error-500">
				<div class="flex flex-col items-center gap-2">
					<iconify-icon icon="mdi:alert-circle" width="48"></iconify-icon>
					<p>{error}</p>
					<button class="btn btn-sm preset-tonal-error mt-4" onclick={fetchEntries}>Retry</button>
				</div>
			</div>
		{:else if filteredEntries.length === 0}
			<div class="flex h-full items-center justify-center py-12 opacity-40">
				<div class="flex flex-col items-center gap-2">
					<iconify-icon icon="mdi:database-search" width="48"></iconify-icon>
					<p>No entries found matching your search</p>
				</div>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-2 p-1">
				{#each filteredEntries as entry (entry._id || entry.id)}
					{const id = entry._id || entry.id}
					{const idStr = id.toString()}
					{const isSelected = selected.has(idStr)}
					<button>
						type="button"
						class="flex w-full items-center gap-3 rounded-lg p-3 text-start transition-all duration-200 hover:bg-surface-200 dark:hover:bg-surface-800 focus:ring-2 focus:ring-primary-500"
						class:bg-tertiary-500={isSelected} class:dark:bg-primary-500={isSelected}
						class:text-white={isSelected}
						onclick={() => toggleSelection(idStr)}
					>
						<div class="flex h-6 w-6 items-center justify-center rounded border border-surface-500/30 bg-white/10">
							{#if isSelected}
								<iconify-icon icon="fa:check" width="14" transition:fade></iconify-icon>
							{/if}
						</div>
						
						<div class="flex flex-col overflow-hidden">
							<span class="truncate font-medium">{entry[displayField] || idStr}</span>
							<span class="truncate text-xs opacity-50 font-mono" class:text-white={isSelected}>{idStr}</span>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Footer -->
	<footer class="flex items-center justify-between border-t border-surface-500/20 pt-4">
		<button
			type="button"
			class="btn preset-outlined-secondary-500"
			onclick={handleCancel}
		>
			{button_cancel()}
		</button>
		
		<div class="flex items-center gap-3">
			<button
				type="button"
				class="btn preset-filled-tertiary-500 dark:preset-filled-primary-500"
				onclick={handleSave}
			>
				<iconify-icon icon="mdi:check" class="mr-1"></iconify-icon>
				{button_save()}
			</button>
		</div>
	</footer>
</div>

<style>
	.relation-modal {
		backdrop-filter: blur(16px);
	}
	
	/* Smooth scrollbar for the list */
	.list-container::-webkit-scrollbar {
		width: 6px;
	}
	.list-container::-webkit-scrollbar-track {
		background: transparent;
	}
	.list-container::-webkit-scrollbar-thumb {
		background: rgba(var(--color-surface-500) / 0.2);
		border-radius: 10px;
	}
	.list-container::-webkit-scrollbar-thumb:hover {
		background: rgba(var(--color-surface-500) / 0.4);
	}
</style>
