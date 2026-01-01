<!--
@component WidgetDashboard
**Widget Management Dashboard with 3-Pillar Architecture Support**

Features:
- Full 3-pillar architecture visibility
- Enhanced widget metadata display
- Better filtering and search
- Improved UX with widget cards
- Multi-tenant support
- Integrated marketplace tab
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { logger } from '@utils/logger';
	import WidgetCard from './WidgetCard.svelte';
	import { widgetStoreActions } from '@stores/widgetStore.svelte';

	// Props
	const { data }: { data: any } = $props();

	// Define the Widget type
	interface Widget {
		name: string;
		isCore: boolean;
		isActive: boolean;
		description?: string;
		icon: string;
		dependencies: string[];
		canDisable: boolean;
		pillar?: {
			input?: { exists: boolean };
			display?: { exists: boolean };
		};
	}

	// State
	let widgets: Widget[] = $state([]);
	let isLoading = $state(true);
	let searchQuery = $state('');
	let activeFilter = $state('all');
	let activeTab = $state('installed');
	let error: string | null = $state(null);

	// Get tenant info from page data or user session
	const tenantId = $derived(data?.user?.tenantId || data?.tenantId || 'default-tenant');

	// User permissions
	const userRole = $derived(data?.user?.role || 'user');
	const userPermissions = $derived(data?.user?.permissions || []);
	const canManageWidgets = $derived(
		userRole === 'admin' || userRole === 'super-admin' || userPermissions.includes('manage_widgets') || userPermissions.includes('widget_management')
	);

	// Computed stats
	const stats = $derived({
		total: widgets.length,
		core: widgets.filter((w) => w.isCore).length,
		custom: widgets.filter((w) => !w.isCore).length,
		active: widgets.filter((w) => w.isActive).length,
		inactive: widgets.filter((w) => !w.isActive).length,
		withInput: widgets.filter((w) => w.pillar?.input?.exists).length,
		withDisplay: widgets.filter((w) => w.pillar?.display?.exists).length
	});

	// Filtered widgets
	const filteredWidgets = $derived(
		widgets.filter((widget) => {
			// Search filter
			const matchesSearch =
				searchQuery === '' ||
				widget.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				widget.description?.toLowerCase().includes(searchQuery.toLowerCase());

			// Category filter
			let matchesFilter = false;
			switch (activeFilter) {
				case 'all':
					matchesFilter = true;
					break;
				case 'core':
					matchesFilter = widget.isCore;
					break;
				case 'custom':
					matchesFilter = !widget.isCore;
					break;
				case 'active':
					matchesFilter = widget.isActive;
					break;
				case 'inactive':
					matchesFilter = !widget.isActive;
					break;
			}

			return matchesSearch && matchesFilter;
		})
	);

	onMount(() => {
		loadWidgets();

		// Keyboard shortcuts
		const handleKeyboard = (e: KeyboardEvent) => {
			// Ctrl/Cmd + F: Focus search
			if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
				e.preventDefault();
				(document.querySelector('input[type="text"]') as HTMLElement)?.focus();
			}
			// Escape: Clear search
			if (e.key === 'Escape' && searchQuery) {
				searchQuery = '';
			}
		};

		window.addEventListener('keydown', handleKeyboard);

		return () => {
			window.removeEventListener('keydown', handleKeyboard);
		};
	});

	async function loadWidgets() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch(`/api/widgets/list?tenantId=${tenantId}`);

			if (!response.ok) {
				throw new Error(`Failed to load widgets: ${response.statusText}`);
			}

			const result = await response.json();
			widgets = result.widgets || [];

			console.info('Loaded widgets:', {
				total: widgets.length,
				core: widgets.filter((w) => w.isCore).length,
				custom: widgets.filter((w) => !w.isCore).length
			});
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load widgets';
			logger.error('Error loading widgets:', err);
		} finally {
			isLoading = false;
		}
	}

	async function toggleWidget(widgetName: string) {
		if (!canManageWidgets) {
			alert('You do not have permission to manage widgets. Contact your administrator.');
			return;
		}

		try {
			const widget = widgets.find((w) => w.name === widgetName);
			if (!widget) return;

			const newStatus = !widget.isActive;

			const response = await fetch('/api/widgets/status', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Tenant-ID': tenantId
				},
				body: JSON.stringify({
					widgetName,
					isActive: newStatus
				})
			});

			if (!response.ok) {
				throw new Error(`Failed to update widget status: ${response.statusText}`);
			}

			// Force refresh: Clear cache and reload widget store + widget list
			// This ensures the UI is perfectly in sync with database
			await widgetStoreActions.initializeWidgets(tenantId);
			await loadWidgets();

			console.info(`Widget ${widgetName} ${newStatus ? 'activated' : 'deactivated'} - Store and UI refreshed`);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to update widget status';
			logger.error('Error toggling widget:', err);
			alert(`Error: ${message}`);
		}
	}

	async function uninstallWidget(widgetName: string) {
		if (!canManageWidgets) {
			alert('You do not have permission to uninstall widgets. Contact your administrator.');
			return;
		}

		if (!confirm(`Are you sure you want to uninstall the widget "${widgetName}"?`)) {
			return;
		}

		try {
			const response = await fetch(`/api/widgets/uninstall`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Tenant-ID': tenantId
				},
				body: JSON.stringify({ widgetName })
			});

			if (!response.ok) {
				throw new Error(`Failed to uninstall widget: ${response.statusText}`);
			}

			// Reload widgets after uninstallation
			await loadWidgets();
			console.info(`Widget ${widgetName} uninstalled`);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to uninstall widget';
			logger.error('Error uninstalling widget:', err);
			alert(`Error: ${message}`);
		}
	}
</script>

<div class="wrapper h-full max-h-screen space-y-6 overflow-y-auto p-4 pb-16">
	{#if isLoading}
		<div class="flex items-center justify-center p-8">
			<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
			<span class="ml-3 text-lg">Loading widgets...</span>
		</div>
	{:else if error}
		<div class="rounded-lg border border-red-200 bg-red-50 p-4 dark:bg-red-900/20">
			<div class="flex items-start gap-3">
				<iconify-icon icon="mdi:alert-circle" class="mt-1 text-xl text-red-600"></iconify-icon>
				<div>
					<h3 class="font-semibold text-red-800 dark:text-red-300">Error Loading Widgets</h3>
					<p class="text-red-700 dark:text-red-400">{error}</p>
					<button onclick={() => loadWidgets()} class="mt-2 rounded-lg bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"> Retry </button>
				</div>
			</div>
		</div>
	{:else}
		<!-- Permission Notice -->
		{#if !canManageWidgets}
			<div class="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:bg-amber-900/20">
				<div class="flex items-start gap-3">
					<iconify-icon icon="mdi:shield-alert" class="mt-1 text-xl text-amber-600"></iconify-icon>
					<div>
						<h3 class="font-semibold text-amber-800 dark:text-amber-300">Limited Access</h3>
						<p class="text-amber-700 dark:text-amber-400">
							You have read-only access to widget management. Contact your administrator to request widget management permissions.
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Tab Navigation -->
		<div class="flex gap-2 border-b border-gray-200 dark:border-gray-700">
			<button
				onclick={() => (activeTab = 'installed')}
				class="border-b-2 px-6 py-3 font-medium transition-colors {activeTab === 'installed'
					? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
					: 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'}"
			>
				<div class="flex items-center gap-2">
					<iconify-icon icon="mdi:puzzle" class="text-xl"></iconify-icon>
					<span>Installed Widgets</span>
				</div>
			</button>
			<button
				onclick={() => (activeTab = 'marketplace')}
				class="border-b-2 px-6 py-3 font-medium transition-colors {activeTab === 'marketplace'
					? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
					: 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'}"
			>
				<div class="flex items-center gap-2">
					<iconify-icon icon="mdi:store" class="text-xl"></iconify-icon>
					<span>Marketplace</span>
					<span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
						Coming Soon
					</span>
				</div>
			</button>
		</div>

		{#if activeTab === 'installed'}
			<!-- Summary Cards with Colored Backgrounds and Tooltips -->
			<div class="grid grid-cols-2 gap-4 md:grid-cols-4" data-testid="widget-stats">
				<!-- Total Widgets -->
				<div class="relative rounded-lg bg-blue-50 p-4 shadow-sm transition-all hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30">
					<button
						class="btn-icon btn-icon-sm absolute right-2 top-2 text-blue-600 dark:text-blue-400"
						aria-label="Information about total widgets"
						title="All registered widgets in the system (core + custom)"
					>
						<iconify-icon icon="mdi:information-outline" class="text-lg"></iconify-icon>
					</button>
					<div class="flex items-center gap-3">
						<iconify-icon icon="mdi:widgets" class="text-2xl text-blue-600 dark:text-blue-400"></iconify-icon>
						<div>
							<h3 class="font-semibold text-blue-800 dark:text-blue-300">Total</h3>
							<p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
						</div>
					</div>
				</div>

				<!-- Active Widgets -->
				<div class="relative rounded-lg bg-green-50 p-4 shadow-sm transition-all hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30">
					<button
						class="btn-icon btn-icon-sm absolute right-2 top-2 text-primary-500"
						aria-label="Information about active widgets"
						title="Widgets currently enabled and available for use in collections"
					>
						<iconify-icon icon="mdi:information-outline" class="text-lg"></iconify-icon>
					</button>
					<div class="flex items-center gap-3">
						<iconify-icon icon="mdi:check-circle" class="text-2xl text-primary-500"></iconify-icon>
						<div>
							<h3 class="font-semibold text-primary-500">Active</h3>
							<p class="text-2xl font-bold text-primary-500">{stats.active}</p>
						</div>
					</div>
				</div>

				<!-- Core Widgets -->
				<div class="relative rounded-lg bg-blue-50 p-4 shadow-sm transition-all hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30">
					<button
						class="btn-icon btn-icon-sm absolute right-2 top-2 text-blue-600 dark:text-blue-400"
						aria-label="Information about core widgets"
						title="Essential system widgets that are always active and cannot be disabled"
					>
						<iconify-icon icon="mdi:information-outline" class="text-lg"></iconify-icon>
					</button>
					<div class="flex items-center gap-3">
						<iconify-icon icon="mdi:puzzle" class="text-2xl text-blue-600 dark:text-blue-400"></iconify-icon>
						<div>
							<h3 class="font-semibold text-blue-800 dark:text-blue-300">Core</h3>
							<p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.core}</p>
						</div>
					</div>
				</div>

				<!-- Custom Widgets -->
				<div
					class="relative rounded-lg bg-yellow-50 p-4 shadow-sm transition-all hover:bg-yellow-100 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/30"
				>
					<button
						class="btn-icon btn-icon-sm absolute right-2 top-2 text-yellow-600 dark:text-yellow-400"
						aria-label="Information about custom widgets"
						title="Optional widgets that can be toggled on/off as needed"
					>
						<iconify-icon icon="mdi:information-outline" class="text-lg"></iconify-icon>
					</button>
					<div class="flex items-center gap-3">
						<iconify-icon icon="mdi:puzzle-plus" class="text-2xl text-yellow-600 dark:text-yellow-400"></iconify-icon>
						<div>
							<h3 class="font-semibold text-yellow-800 dark:text-yellow-300">Custom</h3>
							<p class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.custom}</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Filters and Search -->
			<div class="card preset-filled-surface-500 mt-6 space-y-4 p-4">
				<!-- Search and Sync Button Row -->
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
					<!-- Search -->
					<div class="relative flex-1">
						<iconify-icon icon="mdi:magnify" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></iconify-icon>
						<input type="text" bind:value={searchQuery} placeholder="Search widgets... (Ctrl+F)" class="input py-2 pl-10 pr-10 dark:text-white" />
						{#if searchQuery}
							<button
								onclick={() => (searchQuery = '')}
								class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
								aria-label="Clear search"
								title="Clear search (Esc)"
							>
								<iconify-icon icon="mdi:close-circle" class="text-lg"></iconify-icon>
							</button>
						{/if}
					</div>
				</div>

				<!-- Badges Counts -->
				<div class="flex flex-wrap gap-2">
					{#each [{ value: 'all' as const, label: 'All', count: stats.total, icon: 'mdi:widgets' }, { value: 'active' as const, label: 'Active', count: stats.active, icon: 'mdi:check-circle' }, { value: 'inactive' as const, label: 'Inactive', count: stats.inactive, icon: 'mdi:pause-circle' }, { value: 'core' as const, label: 'Core', count: stats.core, icon: 'mdi:puzzle' }, { value: 'custom' as const, label: 'Custom', count: stats.custom, icon: 'mdi:puzzle-plus' }] as filter}
						<button
							onclick={() => (activeFilter = filter.value)}
							class="btn {activeFilter === filter.value ? 'preset-filled-tertiary-500 text-white' : 'preset-ghost-secondary-500 '}"
							aria-label="{filter.label} widgets ({filter.count})"
						>
							<iconify-icon icon={filter.icon} class="text-lg"></iconify-icon>
							<span>{filter.label}</span>
							<span
								class="rounded-full px-2 py-0.5 text-xs font-semibold {activeFilter === filter.value
									? 'bg-blue-500 text-white'
									: 'bg-gray-300 text-gray-700 dark:bg-gray-600 dark:text-gray-300'}"
							>
								{filter.count}
							</span>
						</button>
					{/each}
				</div>
			</div>
			<!-- Widgets Grid - 2 Column Layout for Desktop -->
			<div class="mb-12 grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="widget-grid">
				{#if filteredWidgets.length === 0}
					<div
						class="col-span-full rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center dark:border-gray-600 dark:bg-gray-800"
					>
						<iconify-icon icon="mdi:package-preset-closed" class="mx-auto text-6xl text-gray-400"></iconify-icon>
						<h3 class="mt-4 text-lg font-semibold text-gray-900 dark:text-white">No Widgets Found</h3>
						<p class="mt-2 text-gray-600 dark:text-gray-400">
							{#if searchQuery}
								No widgets match your search "<strong>{searchQuery}</strong>"
							{:else if activeFilter !== 'all'}
								No {activeFilter} widgets available
							{:else}
								No widgets match your criteria
							{/if}
						</p>
						{#if searchQuery || activeFilter !== 'all'}
							<button
								onclick={() => {
									searchQuery = '';
									activeFilter = 'all';
								}}
								class="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
								aria-label="Clear all filters and search"
							>
								<iconify-icon icon="mdi:filter-remove" class="text-lg"></iconify-icon>
								Clear All Filters
							</button>
						{/if}
					</div>
				{:else}
					{#each filteredWidgets as widget (widget.name)}
						<WidgetCard {widget} onToggle={toggleWidget} onUninstall={uninstallWidget} canManage={canManageWidgets} />
					{/each}
				{/if}
			</div>
		{:else}
			<!-- Marketplace Tab -->
			<div class="rounded-lg border border-gray-200 bg-gray-50 p-12 text-center dark:border-gray-700 dark:bg-gray-800">
				<div class="mx-auto max-w-md">
					<iconify-icon icon="mdi:store" class="mx-auto text-6xl text-tertiary-500 dark:text-primary-500"></iconify-icon>
					<h3 class="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Marketplace Coming Soon</h3>
					<p class="mt-2 text-gray-600 dark:text-gray-400">
						The Widget Marketplace will allow you to discover, install, and manage premium and community widgets to extend your SveltyCMS
						functionality.
					</p>
					<div class="mt-6 space-y-2 text-left">
						<div class="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
							<iconify-icon icon="mdi:check-circle" class="mt-0.5 text-tertiary-500 dark:text-primary-500"></iconify-icon>
							<span>Browse hundreds of widgets across multiple categories</span>
						</div>
						<div class="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
							<iconify-icon icon="mdi:check-circle" class="mt-0.5 text-tertiary-500 dark:text-primary-500"></iconify-icon>
							<span>One-click installation and automatic updates</span>
						</div>
						<div class="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
							<iconify-icon icon="mdi:check-circle" class="mt-0.5 text-tertiary-500 dark:text-primary-500"></iconify-icon>
							<span>Community ratings and reviews</span>
						</div>
						<div class="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
							<iconify-icon icon="mdi:check-circle" class="mt-0.5 text-tertiary-500 dark:text-primary-500"></iconify-icon>
							<span>Support for both free and premium widgets</span>
						</div>
					</div>
					<button
						disabled
						class="mt-6 cursor-not-allowed rounded-lg bg-gray-300 px-6 py-3 font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-500"
					>
						Coming in Future Update
					</button>
				</div>
			</div>
		{/if}
	{/if}
</div>

<!-- Tooltip Popups for Metric Cards - Uniform Dark/Light Theme -->
<div class="card preset-filled z-50 max-w-xs p-3 shadow-xl" data-popup="totalTooltip">
	<p class="text-sm">All registered widgets in the system (core + custom)</p>
	<div class="preset-filled arrow"></div>
</div>

<div class="card preset-filled z-50 max-w-xs p-3 shadow-xl" data-popup="activeTooltip">
	<p class="text-sm">Widgets currently enabled and available for use in collections</p>
	<div class="preset-filled arrow"></div>
</div>

<div class="card preset-filled z-50 max-w-xs p-3 shadow-xl" data-popup="coreTooltip">
	<p class="text-sm">Essential system widgets that are always active and cannot be disabled</p>
	<div class="preset-filled arrow"></div>
</div>

<div class="card preset-filled z-50 max-w-xs p-3 shadow-xl" data-popup="customTooltip">
	<p class="text-sm">Optional widgets that can be toggled on/off as needed</p>
	<div class="preset-filled arrow"></div>
</div>
