<!-- 
  Example: Widget Management Dashboard Component
  Shows how to use the new widget store in a Svelte component
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		widgetStoreActions,
		activeWidgets,
		coreWidgets,
		customWidgets,
		isLoading,
		isWidgetCore,
		canDisableWidget,
		getWidgetDependencies
	} from '@stores/widgetStore.svelte';

	let tenantId = 'example-tenant';
	let validationResult: { valid: number; invalid: number; warnings: string[] } | null = null;
	let requiredWidgets: string[] = [];

	// Reactive variables
	$: coreWidgetsList = $coreWidgets;
	$: customWidgetsList = $customWidgets;
	$: activeWidgetsList = $activeWidgets;
	$: loading = $isLoading;

	onMount(async () => {
		try {
			// Initialize widgets for the tenant
			await widgetStoreActions.initializeWidgets(tenantId);

			// Load additional data
			await loadAnalysisData();
		} catch (error) {
			logger.error('Failed to initialize widget dashboard:', error);
		}
	});

	async function loadAnalysisData() {
		try {
			// Get widgets required by collections
			requiredWidgets = await widgetStoreActions.getRequiredWidgetsByCollections(tenantId);

			// Validate collections against current widget state
			validationResult = await widgetStoreActions.validateCollectionsAgainstWidgets(tenantId);
		} catch (error) {
			console.error('Failed to load analysis data:', error);
		}
	}

	async function toggleWidget(widgetName: string) {
		try {
			const isActive = activeWidgetsList.includes(widgetName);
			const newStatus = isActive ? 'inactive' : 'active';

			await widgetStoreActions.updateWidgetStatus(widgetName, newStatus, tenantId);

			// Reload analysis data after status change
			await loadAnalysisData();
		} catch (error) {
			console.error(`Failed to toggle widget ${widgetName}:`, error);
			alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async function bulkActivateRequired() {
		try {
			await widgetStoreActions.bulkActivateWidgets(requiredWidgets, tenantId);
			await loadAnalysisData();
		} catch (error) {
			console.error('Failed to bulk activate required widgets:', error);
			alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	function getWidgetStatus(widgetName: string): 'core' | 'active' | 'inactive' {
		if (isWidgetCore(widgetName)) return 'core';
		return activeWidgetsList.includes(widgetName) ? 'active' : 'inactive';
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'core':
				return 'text-blue-600 bg-blue-100';
			case 'active':
				return 'text-green-600 bg-green-100';
			case 'inactive':
				return 'text-gray-600 bg-gray-100';
			default:
				return 'text-gray-600 bg-gray-100';
		}
	}
</script>

<div class="mx-auto max-w-6xl p-6">
	<h1 class="mb-6 text-3xl font-bold">Widget Management Dashboard</h1>

	{#if loading}
		<div class="flex items-center justify-center p-8">
			<div class="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
			<span class="ml-3 text-lg">Loading widgets...</span>
		</div>
	{:else}
		<!-- Summary Cards -->
		<div class="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
			<div class="rounded-lg bg-blue-50 p-4">
				<h3 class="font-semibold text-blue-800">Core Widgets</h3>
				<p class="text-2xl font-bold text-blue-600">{coreWidgetsList.length}</p>
				<p class="text-sm text-blue-600">Always enabled</p>
			</div>

			<div class="rounded-lg bg-green-50 p-4">
				<h3 class="font-semibold text-green-800">Active Custom</h3>
				<p class="text-2xl font-bold text-green-600">
					{activeWidgetsList.filter((w) => !isWidgetCore(w)).length}
				</p>
				<p class="text-sm text-green-600">Currently enabled</p>
			</div>

			<div class="rounded-lg bg-orange-50 p-4">
				<h3 class="font-semibold text-orange-800">Required</h3>
				<p class="text-2xl font-bold text-orange-600">{requiredWidgets.length}</p>
				<p class="text-sm text-orange-600">Needed by collections</p>
			</div>

			{#if validationResult}
				<div class="rounded-lg bg-red-50 p-4">
					<h3 class="font-semibold text-red-800">Invalid Collections</h3>
					<p class="text-2xl font-bold text-red-600">{validationResult.invalid}</p>
					<p class="text-sm text-red-600">Missing widgets</p>
				</div>
			{/if}
		</div>

		<!-- Actions -->
		{#if requiredWidgets.length > 0}
			<div class="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-4">
				<h3 class="mb-2 font-semibold text-orange-800">Required Widgets</h3>
				<p class="mb-3 text-orange-700">
					The following widgets are required by your collections: {requiredWidgets.join(', ')}
				</p>
				<button on:click={bulkActivateRequired} class="rounded bg-orange-600 px-4 py-2 text-white hover:bg-orange-700">
					Activate All Required Widgets
				</button>
			</div>
		{/if}

		<!-- Validation Warnings -->
		{#if validationResult && validationResult.warnings.length > 0}
			<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
				<h3 class="mb-2 font-semibold text-red-800">Collection Validation Warnings</h3>
				<ul class="list-inside list-disc text-red-700">
					{#each validationResult.warnings as warning}
						<li>{warning}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Widget Lists -->
		<div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
			<!-- Core Widgets -->
			<div>
				<h2 class="mb-4 text-xl font-semibold">Core Widgets</h2>
				<div class="space-y-2">
					{#each coreWidgetsList as widgetName}
						{@const status = getWidgetStatus(widgetName)}
						{@const dependencies = getWidgetDependencies(widgetName)}

						<div class="flex items-center justify-between rounded-lg border bg-gray-50 p-3">
							<div>
								<span class="font-medium">{widgetName}</span>
								{#if dependencies.length > 0}
									<div class="text-sm text-gray-600">
										Depends on: {dependencies.join(', ')}
									</div>
								{/if}
							</div>
							<span class="rounded px-2 py-1 text-xs font-medium {getStatusColor(status)}">
								{status.toUpperCase()}
							</span>
						</div>
					{/each}
				</div>
			</div>

			<!-- Custom Widgets -->
			<div>
				<h2 class="mb-4 text-xl font-semibold">Custom Widgets</h2>
				<div class="space-y-2">
					{#each customWidgetsList as widgetName}
						{@const status = getWidgetStatus(widgetName)}
						{@const dependencies = getWidgetDependencies(widgetName)}
						{@const canDisable = canDisableWidget(widgetName)}
						{@const isActive = status === 'active'}

						<div class="flex items-center justify-between rounded-lg border p-3">
							<div>
								<span class="font-medium">{widgetName}</span>
								{#if dependencies.length > 0}
									<div class="text-sm text-gray-600">
										Depends on: {dependencies.join(', ')}
									</div>
								{/if}
								{#if !canDisable && isActive}
									<div class="text-sm text-orange-600">Cannot disable: other widgets depend on this</div>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								<span class="rounded px-2 py-1 text-xs font-medium {getStatusColor(status)}">
									{status.toUpperCase()}
								</span>
								<button
									on:click={() => toggleWidget(widgetName)}
									disabled={!canDisable && isActive}
									class="rounded px-3 py-1 text-sm {isActive
										? canDisable
											? 'bg-red-100 text-red-700 hover:bg-red-200'
											: 'cursor-not-allowed bg-gray-100 text-gray-400'
										: 'bg-green-100 text-green-700 hover:bg-green-200'}"
								>
									{isActive ? 'Disable' : 'Enable'}
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>
