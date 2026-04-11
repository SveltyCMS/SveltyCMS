<script lang="ts">
import { globalSearchIndex } from "@utils/global-search-index";
import { ui } from "@src/stores/ui-store.svelte";
import { onMount } from "svelte";
import { goto } from "$app/navigation";
import Icon from "@iconify/svelte";
import { fade, fly } from "svelte/transition";

let searchQuery = $state("");
let inputRef = $state<HTMLInputElement | null>(null);
let selectedIndex = $state(0);

interface ActionItem {
	title: string;
	description?: string;
	icon?: string;
	path?: string;
	shortcut?: string;
	type: "action" | "search";
}

// Navigation shortcuts for Linear-style quick access
const quickActions: ActionItem[] = [
	{
		title: "Go to Dashboard",
		icon: "mdi:view-dashboard",
		path: "/dashboard",
		shortcut: "G D",
		type: "action",
	},
	{
		title: "Media Gallery",
		icon: "mdi:image-multiple",
		path: "/mediagallery",
		shortcut: "G M",
		type: "action",
	},
	{
		title: "Collection Builder",
		icon: "mdi:database-edit",
		path: "/config/collectionbuilder",
		shortcut: "G C",
		type: "action",
	},
	{
		title: "System Settings",
		icon: "mdi:cog",
		path: "/config",
		shortcut: "G S",
		type: "action",
	},
];

const filteredResults = $derived.by(() => {
	if (!searchQuery) return quickActions;

	const query = searchQuery.toLowerCase();
	const searchItems: ActionItem[] = $globalSearchIndex.map((item) => ({
		title: item.title,
		description: item.description,
		path: Object.values(item.triggers)[0]?.path,
		type: "search",
	}));

	return searchItems
		.filter(
			(item) =>
				item.title.toLowerCase().includes(query) ||
				(item.description && item.description.toLowerCase().includes(query)),
		)
		.slice(0, 8);
});

$effect(() => {
	if (selectedIndex >= filteredResults.length) {
		selectedIndex = Math.max(0, filteredResults.length - 1);
	}
});

function handleKeydown(e: KeyboardEvent) {
	if (e.key === "ArrowDown") {
		e.preventDefault();
		selectedIndex = (selectedIndex + 1) % filteredResults.length;
	} else if (e.key === "ArrowUp") {
		e.preventDefault();
		selectedIndex =
			(selectedIndex - 1 + filteredResults.length) % filteredResults.length;
	} else if (e.key === "Enter") {
		e.preventDefault();
		const selected = filteredResults[selectedIndex];
		if (selected) executeAction(selected);
	} else if (e.key === "Escape") {
		ui.isCommandBarVisible = false;
	}
}

async function executeAction(item: ActionItem) {
	if (item.path) {
		await goto(item.path);
	}
	ui.isCommandBarVisible = false;
	searchQuery = "";
}

onMount(() => {
	inputRef?.focus();
});
</script>

<!-- Backdrop -->
<div 
	class="fixed inset-0 z-[100] bg-surface-900/40 backdrop-blur-xs transition-opacity"
	onclick={() => ui.isCommandBarVisible = false}
	onkeydown={(e) => e.key === 'Escape' && (ui.isCommandBarVisible = false)}
	role="button"
	tabindex="-1"
	aria-label="Close command palette"
	transition:fade={{ duration: 150 }}
></div>

<!-- Command Palette Container -->
<div 
	class="fixed left-1/2 top-[15%] z-[101] w-full max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl border border-surface-200 bg-white shadow-2xl dark:border-surface-700 dark:bg-surface-900"
	transition:fly={{ y: -20, duration: 200 }}
	onkeydown={handleKeydown}
	role="dialog"
	aria-modal="true"
	aria-label="Command palette"
	tabindex="-1"
>
	<!-- Search Input -->
	<div class="flex items-center border-b border-surface-200 px-4 dark:border-surface-700">
		<Icon icon="mdi:magnify" class="text-xl text-surface-400" />
		<input
			bind:this={inputRef}
			bind:value={searchQuery}
			type="text"
			placeholder="Type a command or search..."
			class="w-full border-none bg-transparent py-4 pl-3 pr-4 text-lg outline-hidden ring-0 focus:ring-0 dark:text-white"
			aria-label="Command search"
		/>
		<div class="flex items-center gap-1 rounded-md border border-surface-200 bg-surface-50 px-2 py-0.5 text-xs font-medium text-surface-400 dark:border-surface-700 dark:bg-surface-800">
			ESC
		</div>
	</div>

	<!-- Results Area -->
	<div class="max-h-[400px] overflow-y-auto p-2" role="listbox">
		{#if filteredResults.length > 0}
			{#each filteredResults as item, i}
				<button
					role="option"
					aria-selected={i === selectedIndex}
					class="group flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors {i === selectedIndex ? 'bg-tertiary-500 text-white' : 'hover:bg-surface-100 dark:hover:bg-surface-800'}"
					onclick={() => executeAction(item)}
					onmouseenter={() => selectedIndex = i}
				>
					<div class="flex items-center gap-3">
						{#if item.icon}
							<Icon icon={item.icon} class="text-xl {i === selectedIndex ? 'text-white' : 'text-surface-400'}" />
						{:else}
							<Icon icon="mdi:file-document-outline" class="text-xl {i === selectedIndex ? 'text-white' : 'text-surface-400'}" />
						{/if}
						<div>
							<div class="font-medium">{item.title}</div>
							{#if item.description}
								<div class="text-xs {i === selectedIndex ? 'text-tertiary-100' : 'text-surface-400'}">{item.description}</div>
							{/if}
						</div>
					</div>
					
					{#if item.shortcut}
						<div class="flex gap-1">
							{#each item.shortcut.split(' ') as key}
								<kbd class="rounded border border-surface-200 bg-surface-50 px-1.5 py-0.5 text-[10px] font-bold text-surface-400 dark:border-surface-600 dark:bg-surface-700">
									{key}
								</kbd>
							{/each}
						</div>
					{/if}
				</button>
			{/each}
		{:else}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<Icon icon="mdi:robot-confused" class="mb-4 text-5xl text-surface-300" />
				<div class="text-lg font-medium dark:text-white">No results found</div>
				<p class="text-sm text-surface-400">Try searching for collections, media, or settings.</p>
				
				<button 
					class="mt-6 rounded-lg bg-tertiary-500 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-95"
					onclick={() => {/* AI Action Fallback */}}
				>
					Ask AI Assistant
				</button>
			</div>
		{/if}
	</div>

	<!-- Footer / Tips -->
	<div class="flex items-center justify-between border-t border-surface-200 bg-surface-50 px-4 py-2 text-[11px] font-medium text-surface-400 dark:border-surface-700 dark:bg-surface-800/50">
		<div class="flex items-center gap-4">
			<span class="flex items-center gap-1">
				<kbd class="rounded border border-surface-300 bg-white px-1 dark:border-surface-600 dark:bg-surface-700">↑↓</kbd> Navigate
			</span>
			<span class="flex items-center gap-1">
				<kbd class="rounded border border-surface-300 bg-white px-1 dark:border-surface-600 dark:bg-surface-700">↵</kbd> Select
			</span>
		</div>
		<div class="flex items-center gap-1 text-tertiary-500 dark:text-primary-500">
			<Icon icon="mdi:robot" />
			Powered by AI Core v1.1
		</div>
	</div>
</div>
