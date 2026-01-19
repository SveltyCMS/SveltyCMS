<script lang="ts">
	import PageTitle from '@cms/components/PageTitle.svelte';

	import PluginsView from './components/PluginsView.svelte';
	import ThemesView from './components/ThemesView.svelte';
	import WidgetDashboard from './components/WidgetDashboard.svelte';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';

	interface Props {
		data: {
			permissions: {
				plugins: boolean;
				widgets: boolean;
				themes: boolean;
			};
			canManageMarketplace: boolean;
			plugins: any[];
			[key: string]: any;
		};
	}

	const { data }: Props = $props();

	let activeTab = $state('plugins');
</script>

<PageTitle name="Extension Management" showBackButton={true} backUrl="/config" icon="mdi:puzzle-outline" />

<div class="wrapper p-4">
	<Tabs value={activeTab} onValueChange={(e) => (activeTab = e.value)}>
		<div class="mb-6 flex items-center justify-between border-b border-surface-200 dark:border-surface-700">
			<!-- Tab List -->
			<Tabs.List class="flex gap-2">
				{#if data.permissions.plugins}
					<Tabs.Trigger
						value="plugins"
						class="px-6 py-3 font-medium transition-colors border-b-2 {activeTab === 'plugins'
							? 'border-tertiary-500 text-tertiary-500 dark:border-primary-500 dark:text-primary-500'
							: 'border-transparent text-gray-600 hover:text-gray-900 dark:text-surface-50 dark:hover:text-surface-100'}"
					>
						<div class="flex items-center gap-2">
							<iconify-icon icon="mdi:puzzle" class="text-xl"></iconify-icon>
							<span>Plugins</span>
						</div>
					</Tabs.Trigger>
				{/if}
				{#if data.permissions.widgets}
					<Tabs.Trigger
						value="widgets"
						class="px-6 py-3 font-medium transition-colors border-b-2 {activeTab === 'widgets'
							? 'border-tertiary-500 text-tertiary-500 dark:border-primary-500 dark:text-primary-500'
							: 'border-transparent text-gray-600 hover:text-gray-900 dark:text-surface-50 dark:hover:text-surface-100'}"
					>
						<div class="flex items-center gap-2">
							<iconify-icon icon="mdi:widgets" class="text-xl"></iconify-icon>
							<span>Widgets</span>
						</div>
					</Tabs.Trigger>
				{/if}
				{#if data.permissions.themes}
					<Tabs.Trigger
						value="themes"
						class="px-6 py-3 font-medium transition-colors border-b-2 {activeTab === 'themes'
							? 'border-tertiary-500 text-tertiary-500 dark:border-primary-500 dark:text-primary-500'
							: 'border-transparent text-gray-600 hover:text-gray-900 dark:text-surface-50 dark:hover:text-surface-100'}"
					>
						<div class="flex items-center gap-2">
							<iconify-icon icon="ph:layout" class="text-xl"></iconify-icon>
							<span>Themes</span>
						</div>
					</Tabs.Trigger>
				{/if}
			</Tabs.List>

			<!-- Marketplace Link -->
			{#if data.canManageMarketplace}
				<a
					href="https://marketplace.sveltycms.com"
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-2 px-4 py-2 font-medium text-surface-600 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400"
				>
					<iconify-icon icon="mdi:store" class="text-lg"></iconify-icon>
					<span>Marketplace</span>
					<span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"> Beta </span>
				</a>
			{/if}
		</div>

		<!-- Content -->
		<div class="min-h-[400px]">
			{#if data.permissions.plugins}
				<Tabs.Content value="plugins">
					<PluginsView {data} />
				</Tabs.Content>
			{/if}
			{#if data.permissions.widgets}
				<Tabs.Content value="widgets">
					<WidgetDashboard {data} />
				</Tabs.Content>
			{/if}
			{#if data.permissions.themes}
				<Tabs.Content value="themes">
					<ThemesView />
				</Tabs.Content>
			{/if}
		</div>
	</Tabs>
</div>
