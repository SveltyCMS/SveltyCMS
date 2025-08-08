<!--
@component WidgetDashboard
**Widget Management Dashboard Component for managing content widgets and marketplace integrations**

Features:
- Manage core widgets (always enabled)
- Install/uninstall custom widgets from marketplace
- Activate/deactivate installed widgets
- View widget dependencies and requirements
- Bulk operations for widget management
- Collection validation against active widgets
- Multi-tenant widget configuration
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		widgetStoreActions,
		activeWidgets,
		coreWidgets,
		customWidgets,
		widgetFunctions,
		isLoading,
		isWidgetCore,
		canDisableWidget,
		getWidgetDependencies
	} from '@stores/widgetStore.svelte';
	import { logger } from '@utils/logger.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	let { data }: { data: any } = $props();

	let validationResult = $state<{ valid: number; invalid: number; warnings: string[] } | null>(null);
	let requiredWidgets = $state<string[]>([]);
	let installedWidgets = $state<string[]>([]);
	let searchQuery = $state('');
	let activeFilter = $state<'all' | 'core' | 'active' | 'installed' | 'issues'>('all');

	// Get tenant info from page data or user session
	const tenantId = $derived(data?.user?.tenantId || data?.tenantId || 'default-tenant');

	// User permissions - check if user has admin role or widget management permissions
	const userRole = $derived(data?.user?.role || 'user');
	const userPermissions = $derived(data?.user?.permissions || []);
	const canManageWidgets = $derived(
		userRole === 'admin' || userRole === 'super-admin' || userPermissions.includes('manage_widgets') || userPermissions.includes('widget_management')
	);

	// Reactive variables using runes - properly access store values
	const coreWidgetsList = $derived($coreWidgets || []);
	const customWidgetsList = $derived($customWidgets || []);
	const activeWidgetsList = $derived($activeWidgets || []);
	const widgetFunctionsList = $derived($widgetFunctions || {});
	const loading = $derived($isLoading);

	// Filtered widgets based on search query and active filter
	const filteredCoreWidgets = $derived(
		coreWidgetsList.filter((widget) => {
			const matchesSearch = widget.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesFilter = activeFilter === 'all' || activeFilter === 'core';
			return matchesSearch && matchesFilter;
		})
	);
	const filteredCustomWidgets = $derived(
		customWidgetsList.filter((widget) => {
			const matchesSearch = widget.toLowerCase().includes(searchQuery.toLowerCase());
			const isActive = activeWidgetsList.includes(widget);
			const isInstalled = installedWidgets.includes(widget);

			let matchesFilter = false;
			switch (activeFilter) {
				case 'all':
					matchesFilter = true;
					break;
				case 'active':
					matchesFilter = isActive;
					break;
				case 'installed':
					matchesFilter = isInstalled || isActive;
					break;
				case 'issues':
					matchesFilter = validationResult?.warnings.some((w) => w.includes(widget)) || false;
					break;
				default:
					matchesFilter = false;
			}
			return matchesSearch && matchesFilter;
		})
	);

	onMount(async () => {
		try {
			// Initialize widgets from the store
			await widgetStoreActions.initializeWidgets(tenantId);

			// Load active widgets and other data
			await loadActiveWidgets();
			await loadAnalysisData();
			await loadInstalledWidgets();
		} catch (error) {
			logger.error('Failed to initialize widget dashboard:', error);
		}
	});

	async function loadActiveWidgets() {
		try {
			const response = await fetch('/api/widgets/active');
			if (response.ok) {
				const data = await response.json();
				// The activeWidgets store will be updated through the widget store actions
				logger.info('Active widgets loaded:', data.widgets);
			}
		} catch (error) {
			logger.error('Failed to load active widgets:', error);
		}
	}

	async function loadAnalysisData() {
		try {
			// Get widgets required by collections
			requiredWidgets = await widgetStoreActions.getRequiredWidgetsByCollections(tenantId);

			// Validate collections against current widget state
			validationResult = await widgetStoreActions.validateCollectionsAgainstWidgets(tenantId);
		} catch (error) {
			logger.error('Failed to load analysis data:', error);
		}
	}

	async function loadInstalledWidgets() {
		try {
			const response = await fetch(`/api/widgets/installed?tenantId=${tenantId}`);
			if (response.ok) {
				installedWidgets = await response.json();
			}
		} catch (error) {
			logger.error('Failed to load installed widgets:', error);
		}
	}

	async function toggleWidget(widgetName: string) {
		if (!canManageWidgets) {
			alert('You do not have permission to manage widgets. Contact your administrator.');
			return;
		}

		try {
			const isActive = activeWidgetsList.includes(widgetName);
			const newStatus = isActive ? 'inactive' : 'active';

			await widgetStoreActions.updateWidgetStatus(widgetName, newStatus, tenantId);

			// Reload analysis data after status change
			await loadAnalysisData();
		} catch (error) {
			logger.error(`Failed to toggle widget ${widgetName}:`, error);
			alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async function bulkActivateRequired() {
		if (!canManageWidgets) {
			alert('You do not have permission to manage widgets. Contact your administrator.');
			return;
		}

		try {
			await widgetStoreActions.bulkActivateWidgets(requiredWidgets, tenantId);
			await loadAnalysisData();
		} catch (error) {
			logger.error('Failed to bulk activate required widgets:', error);
			alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async function uninstallWidget(widgetName: string) {
		if (!canManageWidgets) {
			alert('You do not have permission to uninstall widgets. Contact your administrator.');
			return;
		}

		// Check if widget is currently active
		if (activeWidgetsList.includes(widgetName)) {
			alert('Cannot uninstall an active widget. Please deactivate it first.');
			return;
		}

		try {
			const response = await fetch('/api/widgets/uninstall', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ widgetName, tenantId })
			});

			if (response.ok) {
				await loadInstalledWidgets();
				await widgetStoreActions.initializeWidgets(tenantId);
				await loadAnalysisData();
			} else {
				const error = await response.text();
				throw new Error(error);
			}
		} catch (error) {
			logger.error(`Failed to uninstall widget ${widgetName}:`, error);
			alert(`Error uninstalling widget: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	function getWidgetIcon(widgetName: string): string {
		// Get the widget function for this widget name
		const widgetFunction = widgetFunctionsList[widgetName];
		if (widgetFunction?.Icon) {
			return widgetFunction.Icon;
		}

		// Fallback to default icons based on widget type
		return isWidgetCore(widgetName) ? 'mdi:puzzle' : 'mdi:puzzle-plus';
	}
</script>

<div class="container mx-auto h-full max-h-screen space-y-6 overflow-y-auto p-4">
	{#if loading}
		<div class="flex items-center justify-center p-8">
			<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
			<span class="ml-3 text-lg">{m.loading_widgets()}</span>
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
						<p class="mt-1 text-sm text-amber-600 dark:text-amber-500">
							Required role: <strong>admin</strong> or permission: <strong>manage_widgets</strong>
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Summary Cards -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
			<button
				onclick={() => {
					activeFilter = 'core';
				}}
				class="rounded bg-blue-50 p-4 text-left transition-all hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 {activeFilter ===
				'core'
					? 'ring-2 ring-blue-500'
					: ''}"
			>
				<div class="flex items-center gap-3">
					<iconify-icon icon="mdi:shield-check" class="text-2xl text-blue-600"></iconify-icon>
					<div>
						<h3 class="font-semibold text-blue-800 dark:text-blue-300">{m.core_widgets()}</h3>
						<p class="text-2xl font-bold text-blue-600">{coreWidgetsList.length}</p>
						<p class="text-sm text-blue-600">{m.always_enabled()}</p>
					</div>
				</div>
			</button>

			<button
				onclick={() => {
					activeFilter = 'active';
				}}
				class="rounded bg-green-50 p-4 text-left transition-all hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30 {activeFilter ===
				'active'
					? 'ring-2 ring-green-500'
					: ''}"
			>
				<div class="flex items-center gap-3">
					<iconify-icon icon="mdi:check-circle" class="text-2xl text-green-600"></iconify-icon>
					<div>
						<h3 class="font-semibold text-green-800 dark:text-green-300">{m.active_custom()}</h3>
						<p class="text-2xl font-bold text-green-600">
							{activeWidgetsList.filter((w) => !isWidgetCore(w)).length}
						</p>
						<p class="text-sm text-green-600">{m.currently_enabled()}</p>
					</div>
				</div>
			</button>

			<button
				onclick={() => {
					activeFilter = 'installed';
				}}
				class="rounded bg-yellow-50 p-4 text-left transition-all hover:bg-yellow-100 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/30 {activeFilter ===
				'installed'
					? 'ring-2 ring-yellow-500'
					: ''}"
			>
				<div class="flex items-center gap-3">
					<iconify-icon icon="mdi:download" class="text-2xl text-yellow-600"></iconify-icon>
					<div>
						<h3 class="font-semibold text-yellow-800 dark:text-yellow-300">{m.installed()}</h3>
						<p class="text-2xl font-bold text-yellow-600">{customWidgetsList.length}</p>
						<p class="text-sm text-yellow-600">{m.custom_widgets()}</p>
					</div>
				</div>
			</button>

			{#if validationResult}
				<button
					onclick={() => {
						activeFilter = 'issues';
					}}
					class="rounded bg-red-50 p-4 text-left transition-all hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 {activeFilter ===
					'issues'
						? 'ring-2 ring-red-500'
						: ''}"
				>
					<div class="flex items-center gap-3">
						<iconify-icon icon="mdi:alert-circle" class="text-2xl text-red-600"></iconify-icon>
						<div>
							<h3 class="font-semibold text-red-800 dark:text-red-300">{m.issues()}</h3>
							<p class="text-2xl font-bold text-red-600">{validationResult.invalid}</p>
							<p class="text-sm text-red-600">{m.collections_with_issues()}</p>
						</div>
					</div>
				</button>
			{/if}
		</div>

		<!-- Active Filter Indicator -->
		{#if activeFilter !== 'all'}
			<div class="flex items-center justify-between rounded bg-blue-50 p-3 dark:bg-blue-900/20">
				<div class="flex items-center gap-2">
					<iconify-icon icon="mdi:filter" class="text-blue-600"></iconify-icon>
					<span class="text-sm font-medium text-blue-800 dark:text-blue-300">
						Filtering by: {activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)} Widgets
					</span>
				</div>
				<button
					onclick={() => {
						activeFilter = 'all';
					}}
					class="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
				>
					Show All
				</button>
			</div>
		{/if}

		<!-- Required Widgets Alert -->
		{#if requiredWidgets.length > 0}
			<div class="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:bg-orange-900/20">
				<div class="flex items-start gap-3">
					<iconify-icon icon="mdi:alert" class="mt-1 text-xl text-orange-600"></iconify-icon>
					<div class="flex-1">
						<h3 class="font-semibold text-orange-800 dark:text-orange-300">{m.required_widgets()}</h3>
						<p class="mb-3 text-orange-700 dark:text-orange-400">
							{m.widgets_required_by_collections()}: {requiredWidgets.join(', ')}
						</p>
						{#if canManageWidgets}
							<button onclick={bulkActivateRequired} class="rounded bg-orange-600 px-4 py-2 text-white hover:bg-orange-700">
								{m.activate_all_required()}
							</button>
						{:else}
							<span class="rounded bg-gray-300 px-4 py-2 text-gray-600" title="No permission to manage widgets">
								{m.activate_all_required()}
							</span>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- Validation Warnings -->
		{#if validationResult && validationResult.warnings.length > 0}
			<div class="rounded border border-red-200 bg-red-50 p-4 dark:bg-red-900/20">
				<div class="flex items-start gap-3">
					<iconify-icon icon="mdi:alert-circle-outline" class="mt-1 text-xl text-red-600"></iconify-icon>
					<div>
						<h3 class="font-semibold text-red-800 dark:text-red-300">{m.validation_warnings()}</h3>
						<ul class="mt-2 list-inside list-disc text-red-700 dark:text-red-400">
							{#each validationResult.warnings as warning}
								<li>{warning}</li>
							{/each}
						</ul>
					</div>
				</div>
			</div>
		{/if}

		<!-- Widget Management Content -->
		<div class="py-4">
			<!-- Search Bar -->
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold">{m.widget_management()}</h3>
				<div class="relative">
					<input type="text" bind:value={searchQuery} placeholder="Search widgets..." class="input" />
					<iconify-icon icon="mdi:magnify" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"></iconify-icon>
					{#if searchQuery}
						<button
							onclick={() => (searchQuery = '')}
							class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
							aria-label="Clear search"
						>
							<iconify-icon icon="mdi:close"></iconify-icon>
						</button>
					{/if}
				</div>
			</div>

			<!-- Installed/Active Widgets View -->
			<div class="space-y-6">
				<!-- Custom Widgets Grid -->
				{#if filteredCustomWidgets.length === 0}
					<div class="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
						<iconify-icon icon="mdi:widgets-outline" class="mx-auto mb-4 text-4xl text-gray-400"></iconify-icon>
						{#if searchQuery}
							<p class="text-gray-600">No widgets found matching "<strong>{searchQuery}</strong>"</p>
							<button onclick={() => (searchQuery = '')} class="mt-2 text-blue-600 hover:text-blue-700">Clear search</button>
						{:else}
							<p class="text-gray-600">No custom widgets installed</p>
						{/if}
					</div>
				{:else}
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						{#each filteredCustomWidgets as widgetName}
							{@const dependencies = getWidgetDependencies(widgetName)}
							{@const canDisable = canDisableWidget(widgetName)}
							{@const isActive = activeWidgetsList.includes(widgetName)}

							<div
								class="rounded-lg border p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 {isActive
									? 'border-green-200 bg-green-50 dark:bg-green-900/20'
									: 'border-gray-200 bg-white dark:bg-gray-800'}"
							>
								<!-- Widget Header -->
								<div class="flex items-start justify-between">
									<div class="flex-1">
										<div class="flex items-center gap-3">
											<iconify-icon icon={getWidgetIcon(widgetName)} class="text-lg {isActive ? 'text-green-600' : 'text-yellow-600'}"></iconify-icon>
											<span class="font-medium">{widgetName}</span>
											<span
												class="rounded px-2 py-1 text-xs font-medium {isActive ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}"
											>
												{isActive ? 'ACTIVE' : 'INSTALLED'}
											</span>
										</div>
										{#if dependencies.length > 0}
											<div class="mt-2 text-sm text-gray-600">
												{m.depends_on()}: {dependencies.join(', ')}
											</div>
										{/if}
										{#if !canDisable && isActive}
											<div class="mt-2 text-sm text-orange-600">
												{m.cannot_disable_dependency()}
											</div>
										{/if}
									</div>
								</div>

								<!-- Widget Actions -->
								<div class="mt-4 flex flex-wrap items-center gap-2">
									{#if isActive}
										{#if canDisable && canManageWidgets}
											<button
												onclick={() => toggleWidget(widgetName)}
												class="rounded bg-yellow-100 px-3 py-1 text-sm text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-800 dark:text-yellow-200"
											>
												{m.deactivate()}
											</button>
										{:else if !canManageWidgets}
											<span class="rounded bg-gray-100 px-3 py-1 text-sm text-gray-500" title="No permission to manage widgets">
												{m.deactivate()}
											</span>
										{/if}
									{:else if canManageWidgets}
										<button
											onclick={() => toggleWidget(widgetName)}
											class="rounded bg-green-100 px-3 py-1 text-sm text-green-700 hover:bg-green-200 dark:bg-green-800 dark:text-green-200"
										>
											{m.activate()}
										</button>
									{:else}
										<span class="rounded bg-gray-100 px-3 py-1 text-sm text-gray-500" title="No permission to manage widgets">
											{m.activate()}
										</span>
									{/if}

									{#if canManageWidgets}
										<button
											onclick={() => uninstallWidget(widgetName)}
											class="rounded bg-red-100 px-3 py-1 text-sm text-red-700 hover:bg-red-200 dark:bg-red-800 dark:text-red-200 {isActive
												? 'cursor-not-allowed opacity-50'
												: ''}"
											disabled={isActive}
											title={isActive ? 'Deactivate widget first before uninstalling' : 'Uninstall widget'}
										>
											{m.uninstall()}
										</button>
									{:else}
										<span class="rounded bg-gray-100 px-3 py-1 text-sm text-gray-500" title="No permission to manage widgets">
											{m.uninstall()}
										</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Core Widgets Info Section (Collapsible) -->
				<div class="mt-6">
					<details class="group">
						<summary class="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-50 p-3 font-medium hover:bg-blue-100 dark:bg-blue-900/20">
							<iconify-icon icon="mdi:shield-check" class="text-blue-600"></iconify-icon>
							{m.core_widgets()} ({coreWidgetsList.length})
							<iconify-icon icon="mdi:chevron-down" class="ml-auto transition-transform group-open:rotate-180"></iconify-icon>
						</summary>
						<div class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-2">
							{#each filteredCoreWidgets as widgetName}
								<div class="flex items-center justify-between rounded-lg border bg-gray-50 p-3 dark:bg-gray-700">
									<div class="flex items-center gap-3">
										<iconify-icon icon={getWidgetIcon(widgetName)} class="text-lg text-blue-600"></iconify-icon>
										<span class="font-medium">{widgetName}</span>
									</div>
									<span class="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-600"> CORE </span>
								</div>
							{/each}
						</div>
					</details>
				</div>
			</div>
		</div>
	{/if}
</div>
