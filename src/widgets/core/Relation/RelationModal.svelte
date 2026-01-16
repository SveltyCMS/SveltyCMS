<script lang="ts">
	import * as m from '@src/paraglide/messages';
	import { onMount } from 'svelte';

	interface Props {
		collectionId: string;
		close?: (result?: string) => void;
	}

	const { collectionId, close }: Props = $props();

	let searchQuery = $state('');
	// Mock data for now - in production this would fetch from API
	let entries = $state<{ id: string; title: string }[]>([]);
	let loading = $state(true);

	onMount(async () => {
		// Simulate API call
		setTimeout(() => {
			entries = [
				{ id: '1', title: 'Entry 1' },
				{ id: '2', title: 'Entry 2' },
				{ id: '3', title: 'Entry 3' }
			];
			loading = false;
		}, 500);
	});

	function handleSelect(id: string) {
		close?.(id);
	}

	function handleCancel() {
		close?.();
	}
</script>

<div class="space-y-4">
	<header class="text-2xl font-bold text-center">Select Relation</header>

	<p class="text-surface-600 dark:text-surface-300">
		Select an entry from <strong>{collectionId}</strong>
	</p>

	<input class="input" type="search" bind:value={searchQuery} placeholder="Search..." />

	<div class="max-h-60 overflow-y-auto space-y-2 border border-surface-200 dark:border-surface-700 rounded p-2">
		{#if loading}
			<div class="p-4 text-center">Loading...</div>
		{:else if entries.length === 0}
			<div class="p-4 text-center">No entries found</div>
		{:else}
			{#each entries as entry}
				<button
					class="w-full text-left p-2 hover:bg-surface-100 dark:hover:bg-surface-700 rounded transition-colors"
					onclick={() => handleSelect(entry.id)}
				>
					{entry.title} <span class="text-xs text-surface-500">#{entry.id}</span>
				</button>
			{/each}
		{/if}
	</div>

	<footer class="flex justify-end gap-2 pt-4 border-t border-surface-500/20">
		<button class="btn preset-ghost" onclick={handleCancel}>
			{m.button_cancel()}
		</button>
	</footer>
</div>
