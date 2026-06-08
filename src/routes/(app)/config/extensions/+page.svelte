<!--
 @file src/routes/(app)/config/extensions/+page.svelte
 @component Extension Management page (Plugins, Widgets, Themes)
 -->

<script lang="ts">
import { fade } from "svelte/transition";
import PluginsView from "./plugins-view.svelte";
import ThemesView from "./themes-view.svelte";
import WidgetDashboard from "./widget-dashboard.svelte";

let { data }: { data: any } = $props();

let activeTab = $state("plugins");

const tabs = [
	{ id: "plugins", label: "Plugins", icon: "mdi:puzzle" },
	{ id: "widgets", label: "Widgets", icon: "mdi:widgets" },
	{ id: "themes", label: "Themes", icon: "ph:layout" },
];
</script>

<div class="absolute inset-0 p-6 space-y-8 bg-surface-50/50 dark:bg-surface-950/50 overflow-y-auto">
	<!-- Header -->
	<div class="flex items-center justify-between" in:fade>
		<div>
			<h1 class="text-3xl font-bold flex items-center gap-3">
				<iconify-icon icon="mdi:puzzle-outline" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				Extension Management
			</h1>
			<p class="text-sm opacity-50 font-medium">Install and manage plugins, widgets, and themes</p>
		</div>
		<div class="flex items-center gap-2">
			<a href="/config" class="btn preset-ghost-surface-500 btn-sm" data-sveltekit-preload-data="hover">
				<iconify-icon icon="ri:arrow-left-line" width="18"></iconify-icon>
				<span class="hidden sm:inline">Back</span>
			</a>
		</div>
	</div>

	<!-- Tab Navigation & Content -->
	<div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm">
		<div class="mb-8 flex items-center justify-between border-b border-surface-200 dark:border-surface-50">
			<div class="flex gap-2">
				{#each tabs as tab (tab.id)}
					<button
						onclick={() => (activeTab = tab.id)}
						class="relative px-6 py-4 font-medium transition-all {activeTab === tab.id
							? 'text-tertiary-500 dark:text-primary-500'
							: 'text-surface-500 dark:text-surface-50 hover:text-surface-900 dark:hover:text-surface-100'}"
					>
						<div class="flex items-center gap-2">
							<iconify-icon icon={tab.icon} width="20" class="text-xl"></iconify-icon>
							<span>{tab.label}</span>
						</div>
						{#if activeTab === tab.id}
							<div class="absolute bottom-0 start-0 h-0.5 w-full bg-tertiary-500 dark:bg-primary-500"></div>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Marketplace Link (External) -->
			<a
				href="https://sveltycms.com"
				target="_blank"
				rel="noopener noreferrer"
				class="hidden items-center gap-2 rounded-lg bg-surface-100 px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-200 dark:bg-surface-800 dark:hover:bg-surface-700 sm:flex"
			>
				<iconify-icon icon="mdi:store" width={24} class="text-lg"></iconify-icon>
				<span>Marketplace</span>
				<span class="rounded bg-tertiary-100 px-1.5 py-0.5 text-[10px] uppercase text-tertiary-500 dark:bg-primary-900/30 dark:text-primary-500">
					Beta
				</span>
			</a>
		</div>

		<!-- Content Area -->
		<div class="min-h-125">
			{#if activeTab === 'plugins'}
				<PluginsView {data} />
			{:else if activeTab === 'widgets'}
				<WidgetDashboard {data} />
			{:else if activeTab === 'themes'}
				<ThemesView />
			{/if}
		</div>
	</div>
</div>
