<!--
@file src/routes/(app)/config/extensions/+page.svelte
@component Extension Management page (Plugins, Widgets, Themes)

### Features:
- Tabbed plugins / widgets / themes
- Stable data-testids for E2E
-->

<script lang="ts">
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import Button from '@components/ui/button.svelte';
	import PluginsView from './plugins-view.svelte';
	import ThemesView from './themes-view.svelte';
	import WidgetDashboard from './widget-dashboard.svelte';

	let { data }: { data: any } = $props();

	let activeTab = $state('plugins');

	const tabs = [
		{ id: 'plugins', label: 'Plugins', icon: 'mdi:puzzle' },
		{ id: 'widgets', label: 'Widgets', icon: 'mdi:widgets' },
		{ id: 'themes', label: 'Themes', icon: 'ph:layout' },
	] as const;
</script>

<AdminPageShell
	title="Extension Management"
	icon="mdi:puzzle-outline"
	description="Install and manage plugins, widgets, and themes"
	showBackButton={true}
	backUrl="/config"
>
	<div data-testid="extensions-page" class="contents">
		<AdminCard class="p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs">
			<div class="mb-8 flex items-center justify-between border-b border-surface-200 dark:border-surface-50">
				<div class="flex gap-2" role="tablist" aria-label="Extension categories" data-testid="extensions-tabs">
					{#each tabs as tab (tab.id)}
						<Button
							variant="ghost"
							onclick={() => (activeTab = tab.id)}
							class="relative px-6 py-4 font-medium {activeTab === tab.id
								? 'text-tertiary-500 dark:text-primary-500'
								: 'text-surface-500 dark:text-surface-50 hover:text-surface-900 dark:hover:text-surface-100'}"
							aria-selected={activeTab === tab.id}
							role="tab"
							data-testid={`extensions-tab-${tab.id}`}
						>
							<iconify-icon icon={tab.icon} width="20" class="text-xl"></iconify-icon>
							<span>{tab.label}</span>
							{#if activeTab === tab.id}
								<div class="absolute bottom-0 inset-s-0 h-0.5 w-full bg-tertiary-500 dark:bg-primary-500"></div>
							{/if}
						</Button>
					{/each}
				</div>

				<a
					href="https://marketplace.sveltycms.com"
					target="_blank"
					rel="noopener noreferrer"
					class="hidden items-center gap-2 rounded bg-surface-100 px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-200 dark:bg-surface-800 dark:hover:bg-surface-700 sm:flex"
					data-testid="extensions-marketplace"
				>
					<iconify-icon icon="mdi:store" width={24} class="text-lg"></iconify-icon>
					<span>Marketplace</span>
					<span class="rounded bg-tertiary-100 px-1.5 py-0.5 text-[10px] uppercase text-tertiary-500 dark:bg-primary-900/30 dark:text-primary-500">
						Beta
					</span>
				</a>
			</div>

			<div class="min-h-125" data-testid={`extensions-panel-${activeTab}`} role="tabpanel">
				{#if activeTab === 'plugins'}
					<PluginsView {data} />
				{:else if activeTab === 'widgets'}
					<WidgetDashboard {data} />
				{:else if activeTab === 'themes'}
					<ThemesView />
				{/if}
			</div>
		</AdminCard>
	</div>
</AdminPageShell>
