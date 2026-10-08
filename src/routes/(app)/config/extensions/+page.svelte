<!--
@file src/routes/(app)/config/extensions/+page.svelte
@component Extension Management page (Plugins, Widgets, Marketplace)

### Features:
- Tabbed plugins / widgets / marketplace
- Stable data-testids for E2E
-->

<script lang="ts">
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';
	import PluginsView from './plugins-view.svelte';
	import WidgetDashboard from './widget-dashboard.svelte';
	import DashboardWidgetsView from './dashboard-widgets-view.svelte';
	import MarketplaceView from './marketplace-view.svelte';

	let { data }: { data: any } = $props();

	let activeTab = $state('plugins');

	const tabs = [
		{ id: 'plugins', label: 'Plugins', icon: 'mdi:puzzle' },
		{ id: 'widgets', label: 'Content Widgets', icon: 'mdi:widgets' },
		{ id: 'dashboard', label: 'Dashboard Widgets', icon: 'mdi:view-dashboard-outline' },
		{ id: 'marketplace', label: 'Marketplace', icon: 'mdi:store' }
	] as const;
</script>

<AdminPageShell
	title="Extension Management"
	icon="mdi:puzzle-outline"
	description="Install and manage plugins, widgets, and marketplace extensions"
	showBackButton={true}
	backUrl="/config"
	fullHeight
>
	<div data-testid="extensions-page" class="contents">
		<AdminCard
			class="flex min-h-0 flex-1 flex-col border border-surface-500/30 dark:border-surface-500/40 bg-white dark:bg-surface-900/20 backdrop-blur-md shadow-xs p-6"
		>
			<div
				class="mb-4 flex shrink-0 items-center justify-between border-b border-surface-500/30 dark:border-surface-500/40"
			>
				<div
					class="flex gap-1"
					role="tablist"
					aria-label="Extension categories"
					data-testid="extensions-tabs"
				>
					{#each tabs as tab (tab.id)}
						<Button
							variant="ghost"
							onclick={() => (activeTab = tab.id)}
							class="rounded-none! border-b-2 px-4 py-3 text-sm font-medium {activeTab === tab.id
								? 'border-primary-500 text-primary-600 dark:text-primary-500'
								: 'border-transparent text-surface-500 hover:text-surface-600 dark:hover:text-surface-400'}"
							aria-selected={activeTab === tab.id}
							role="tab"
							data-testid={`extensions-tab-${tab.id}`}
						>
							<iconify-icon icon={tab.icon} width="18" height="18" aria-hidden="true"
							></iconify-icon>
							<span>{tab.label}</span>
							{#if tab.id === 'plugins' && data?.plugins?.length}
								<Badge variant="surface" size="sm" class="ms-1.5 font-normal">
									{data.plugins.length}
								</Badge>
							{:else if tab.id === 'widgets'}
								<Badge variant="surface" size="sm" class="ms-1.5 font-normal">17</Badge>
							{:else if tab.id === 'dashboard' && data?.dashboardWidgets?.length}
								<Badge variant="surface" size="sm" class="ms-1.5 font-normal">
									{data.dashboardWidgets.length}
								</Badge>
							{:else if tab.id === 'marketplace'}
								<Badge variant="tertiary" size="sm" class="ms-1.5 font-normal">52</Badge>
							{/if}
						</Button>
					{/each}
				</div>

				<button
					type="button"
					class="hidden items-center gap-2 rounded bg-surface-500/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-200 dark:bg-surface-800 dark:hover:bg-surface-700 sm:flex"
					data-testid="extensions-marketplace"
					onclick={() => (activeTab = 'marketplace')}
				>
					<iconify-icon icon="mdi:store" width={24} class="text-lg"></iconify-icon>
					<span>Marketplace</span>
					<span
						class="rounded bg-tertiary-500/10 px-1.5 py-0.5 text-[10px] uppercase text-tertiary-500 dark:bg-primary-900/20 dark:text-primary-500"
					>
						In-app
					</span>
				</button>
			</div>

			<div
				class="min-h-0 flex-1 overflow-y-auto"
				data-testid={`extensions-panel-${activeTab}`}
				role="tabpanel"
			>
				{#if activeTab === 'plugins'}
					<PluginsView {data} />
				{:else if activeTab === 'widgets'}
					<WidgetDashboard {data} />
				{:else if activeTab === 'dashboard'}
					<DashboardWidgetsView {data} />
				{:else if activeTab === 'marketplace'}
					<MarketplaceView />
				{/if}
			</div>
		</AdminCard>
	</div>
</AdminPageShell>
