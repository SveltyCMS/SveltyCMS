<!-- 
 @file src/routes/(app)/config/extensions/+page.svelte
 @component Extension Management page (Plugins, Widgets, Themes)
 -->

<script lang="ts">
	// Using iconify-icon web component
	import PageTitle from '@components/PageTitle.svelte';
	import PluginsView from './PluginsView.svelte';
	import ThemesView from './ThemesView.svelte';
	import WidgetDashboard from './WidgetDashboard.svelte';

	let { data }: { data: any } = $props();

	let activeTab = $state('plugins');

	const tabs = [
		{ id: 'plugins', label: 'Plugins', icon: 'mdi:puzzle' },
		{ id: 'widgets', label: 'Widgets', icon: 'mdi:widgets' },
		{ id: 'themes', label: 'Themes', icon: 'ph:layout' }
	];
</script>

<PageTitle name="Extension Management" showBackButton={true} backUrl="/config" icon="mdi:puzzle-outline" />

<div class="wrapper p-4">
	<!-- Tab Navigation -->
	<div class="mb-8 flex items-center justify-between border-b border-surface-200 dark:border-surface-50">
		<div class="flex gap-2">
			{#each tabs as tab (tab.id)}
				<button
					onclick={() => (activeTab = tab.id)}
					class="relative px-6 py-4 font-medium transition-all {activeTab === tab.id
						? 'text-primary-500'
						: 'text-surface-500 dark:text-surface-50 hover:text-surface-900 dark:hover:text-surface-100'}"
				>
					<div class="flex items-center gap-2">
						<iconify-icon icon={tab.icon} width="20" class="text-xl"></iconify-icon>
						<span>{tab.label}</span>
					</div>
					{#if activeTab === tab.id}
						<div class="absolute bottom-0 left-0 h-0.5 w-full bg-primary-500"></div>
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
			<span class="rounded bg-tertiary-100 px-1.5 py-0.5 text-[10px] uppercase text-tertiary-500 dark:bg-primary-900/30 dark:text-primary-400">
				Beta
			</span>
		</a>
	</div>

	<!-- Content Area -->
	<div class="min-h-[500px] animate-in fade-in duration-300">
		{#if activeTab === 'plugins'}
			<PluginsView {data} />
		{:else if activeTab === 'widgets'}
			<WidgetDashboard {data} />
		{:else if activeTab === 'themes'}
			<ThemesView />
		{/if}
	</div>
</div>
