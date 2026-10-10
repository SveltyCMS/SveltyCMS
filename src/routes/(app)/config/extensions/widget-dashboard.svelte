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
	import { widgets as widgetRegistry } from '@src/stores/widget-store.svelte.ts';
	import { logger } from '@utils/logger';
	// Using iconify-icon web component
	import { onMount } from 'svelte';
	import WidgetCard from './widget-card.svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import {
		button_cancel,
		button_retry,
		common_active,
		widgetcard_core,
		widgetcard_custom,
		wd_clear_all_filters,
		wd_clear_all_filters_aria,
		wd_clear_search,
		wd_clear_search_aria,
		wd_error_heading,
		wd_filter_aria,
		wd_info_active_aria,
		wd_info_active_title,
		wd_info_core_aria,
		wd_info_core_title,
		wd_info_custom_aria,
		wd_info_custom_title,
		wd_info_total_aria,
		wd_info_total_title,
		wd_limited_access,
		wd_limited_access_desc,
		wd_loading,
		wd_no_criteria,
		wd_no_filter_part1,
		wd_no_filter_part2,
		wd_no_match_part1,
		wd_no_widgets,
		wd_search_placeholder,
		wd_total,
		wd_uninstall,
		wd_uninstall_confirm_part1,
		wd_uninstall_confirm_part2,
		wd_uninstall_modal_title
	} from '@src/paraglide/messages';
	import Modal from '@components/ui/modal.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import {
		listWidgets,
		unwrapWidgetList,
		setWidgetStatus,
		uninstallWidget as apiUninstallWidget
	} from './widgets-api';

	// Props
	const { data }: { data: any } = $props();

	// Define the Widget type
	interface Widget {
		canDisable: boolean;
		dependencies: string[];
		description?: string;
		icon: string;
		isActive: boolean;
		isCore: boolean;
		name: string;
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
	let error: string | null = $state(null);

	// Get tenant info from page data or user session
	const tenantId = $derived(data?.user?.tenantId || data?.tenantId || 'default-tenant');

	// User permissions
	const userRole = $derived(data?.user?.role || 'user');
	const userPermissions = $derived(data?.user?.permissions || []);
	const canManageWidgets = $derived(
		userRole === 'admin' ||
			userRole === 'super-admin' ||
			userPermissions.includes('manage_widgets') ||
			userPermissions.includes('widget_management')
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
			const result = await listWidgets();
			if (!result.success) {
				throw new Error(result.message || 'Failed to load widgets');
			}
			widgets = unwrapWidgetList(result).map((w) => ({
				name: w.name,
				icon: w.icon ?? 'mdi:puzzle',
				isCore: w.isCore ?? false,
				isActive: w.isActive,
				canDisable: w.canDisable ?? true,
				dependencies: w.dependencies ?? [],
				description: w.description,
				pillar: w.pillar
			}));

			logger.debug('Loaded widgets:', {
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

	let uninstallTarget = $state<string | null>(null);
	let uninstallConfirmOpen = $state(false);

	async function toggleWidget(widgetName: string) {
		if (!canManageWidgets) {
			toast.warning({
				title: 'Permission Denied',
				description: 'You do not have permission to manage widgets.'
			});
			return;
		}

		try {
			const widget = widgets.find((w) => w.name === widgetName);
			if (!widget) {
				return;
			}

			const newStatus = !widget.isActive;
			const response = await setWidgetStatus(widgetName, newStatus, tenantId);
			if (!response.success) {
				throw new Error(response.message || 'Failed to update widget status');
			}

			// Force refresh: Clear cache and reload widget store + widget list
			await widgetRegistry.initialize(tenantId);
			await loadWidgets();

			logger.debug(
				`Widget ${widgetName} ${newStatus ? 'activated' : 'deactivated'} - Store and UI refreshed`
			);
			toast.success({
				title: 'Widget Updated',
				description: `Widget "${widgetName}" is now ${newStatus ? 'active' : 'inactive'}.`
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to update widget status';
			logger.error('Error toggling widget:', err);
			toast.error({
				title: 'Update Failed',
				description: message
			});
		}
	}

	function promptUninstall(widgetName: string) {
		if (!canManageWidgets) {
			toast.warning({
				title: 'Permission Denied',
				description: 'You do not have permission to uninstall widgets.'
			});
			return;
		}
		uninstallTarget = widgetName;
		uninstallConfirmOpen = true;
	}

	async function performUninstall() {
		if (!uninstallTarget) return;
		const widgetName = uninstallTarget;
		uninstallConfirmOpen = false;
		uninstallTarget = null;

		try {
			const response = await apiUninstallWidget(widgetName, tenantId);
			if (!response.success) {
				throw new Error(response.message || 'Failed to uninstall widget');
			}

			await loadWidgets();
			logger.debug(`Widget ${widgetName} uninstalled`);
			toast.success({
				title: 'Widget Uninstalled',
				description: `Widget "${widgetName}" was uninstalled successfully.`
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to uninstall widget';
			logger.error('Error uninstalling widget:', err);
			toast.error({
				title: 'Uninstall Failed',
				description: message
			});
		}
	}
</script>

<div class="space-y-6 pb-6">
	{#if isLoading}
		<div class="flex items-center justify-center p-8">
			<div
				class="h-8 w-8 animate-spin rounded-full border-2 border-tertiary-600 border-t-transparent"
			></div>
			<span class="ms-3 text-lg">{wd_loading()}</span>
		</div>
	{:else if error}
		<div class="rounded border border-error-500/20 bg-error-500/10 p-4 dark:bg-error-900/20">
			<div class="flex items-start gap-3">
				<iconify-icon icon="mdi:alert-circle" width="24" class="mt-1 text-xl text-error-600"
				></iconify-icon>
				<div>
					<h3 class="font-semibold text-error-600 dark:text-error-400">{wd_error_heading()}</h3>
					<p class="text-error-600 dark:text-error-400">{error}</p>
					<button
						onclick={() => loadWidgets()}
						class="mt-2 rounded bg-error-500 px-3 py-1 text-sm text-white hover:bg-error-600"
						>{button_retry()}</button
					>
				</div>
			</div>
		</div>
	{:else}
		<!-- Permission Notice -->
		{#if !canManageWidgets}
			<div
				class="rounded border border-warning-500/20 bg-warning-500/10 p-4 dark:bg-warning-900/20"
			>
				<div class="flex items-start gap-3">
					<iconify-icon icon="mdi:information" width="24" class="mt-1 text-xl text-warning-600"
					></iconify-icon>
					<div>
						<h3 class="font-semibold text-warning-600 dark:text-warning-400">
							{wd_limited_access()}
						</h3>
						<p class="text-warning-600 dark:text-warning-400">
							{wd_limited_access_desc()}
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Summary Cards with Colored Backgrounds and Tooltips -->
		<div class="grid grid-cols-2 gap-4 md:grid-cols-4" data-testid="widget-stats">
			<!-- Total Widgets -->
			<div
				class="relative rounded bg-tertiary-500/10 p-4 shadow-sm transition-all hover:bg-tertiary-500/10 dark:bg-tertiary-900/20 dark:hover:bg-tertiary-900/20"
			>
				<Button
					variant="ghost"
					aria-label={wd_info_total_aria()}
					title={wd_info_total_title()}
					class="p-0! min-w-0 absolute inset-e-2 top-2 text-tertiary-600 dark:text-tertiary-400"
				>
					<iconify-icon icon="mdi:information" width="20"></iconify-icon>
				</Button>
				<div class="flex items-center gap-3">
					<iconify-icon
						icon="mdi:widgets"
						width="24"
						class="text-2xl text-tertiary-600 dark:text-tertiary-400"
					></iconify-icon>
					<div>
						<h3 class="font-semibold text-tertiary-600 dark:text-tertiary-400">{wd_total()}</h3>
						<p class="text-2xl font-bold text-tertiary-600 dark:text-tertiary-400">
							{stats.total}
						</p>
					</div>
				</div>
			</div>

			<!-- Active Widgets -->
			<div
				class="relative rounded bg-success-500/10 p-4 shadow-sm transition-all hover:bg-success-500/10 dark:bg-success-900/20 dark:hover:bg-success-900/20"
			>
				<Button
					variant="ghost"
					aria-label={wd_info_active_aria()}
					title={wd_info_active_title()}
					class="p-0! min-w-0 absolute inset-e-2 top-2 text-tertiary-500 dark:text-primary-500"
				>
					<iconify-icon icon="mdi:information" width="20"></iconify-icon>
				</Button>
				<div class="flex items-center gap-3">
					<iconify-icon
						icon="mdi:check-circle"
						width="24"
						class="text-2xl text-tertiary-500 dark:text-primary-500"
					></iconify-icon>
					<div>
						<h3 class="font-semibold text-tertiary-500 dark:text-primary-500">{common_active()}</h3>
						<p class="text-2xl font-bold text-tertiary-500 dark:text-primary-500">
							{stats.active}
						</p>
					</div>
				</div>
			</div>

			<!-- Core Widgets -->
			<div
				class="relative rounded bg-tertiary-500/10 p-4 shadow-sm transition-all hover:bg-tertiary-500/10 dark:bg-tertiary-900/20 dark:hover:bg-tertiary-900/20"
			>
				<Button
					variant="ghost"
					aria-label={wd_info_core_aria()}
					title={wd_info_core_title()}
					class="p-0! min-w-0 absolute inset-e-2 top-2 text-tertiary-600 dark:text-tertiary-400"
				>
					<iconify-icon icon="mdi:information" width="20"></iconify-icon>
				</Button>
				<div class="flex items-center gap-3">
					<iconify-icon
						icon="mdi:puzzle"
						width="24"
						class="text-2xl text-tertiary-600 dark:text-tertiary-400"
					></iconify-icon>
					<div>
						<h3 class="font-semibold text-tertiary-600 dark:text-tertiary-400">
							{widgetcard_core()}
						</h3>
						<p class="text-2xl font-bold text-tertiary-600 dark:text-tertiary-400">
							{stats.core}
						</p>
					</div>
				</div>
			</div>

			<!-- Custom Widgets -->
			<div
				class="relative rounded bg-warning-500/10 p-4 shadow-sm transition-all hover:bg-warning-500/10 dark:bg-warning-900/20 dark:hover:bg-warning-900/20"
			>
				<Button
					variant="ghost"
					aria-label={wd_info_custom_aria()}
					title={wd_info_custom_title()}
					class="p-0! min-w-0 absolute inset-e-2 top-2 text-warning-600 dark:text-warning-400"
				>
					<iconify-icon icon="mdi:information" width="20"></iconify-icon>
				</Button>
				<div class="flex items-center gap-3">
					<iconify-icon
						icon="mdi:puzzle-plus"
						width="24"
						class="text-2xl text-warning-600 dark:text-warning-400"
					></iconify-icon>
					<div>
						<h3 class="font-semibold text-warning-600 dark:text-warning-400">
							{widgetcard_custom()}
						</h3>
						<p class="text-2xl font-bold text-warning-600 dark:text-warning-400">
							{stats.custom}
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Filters and Search -->
		<div class="card bg-surface-500/10 border border-surface-500/30 rounded-lg mt-6 space-y-4 p-4">
			<!-- Search and Sync Button Row -->
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<!-- Search -->
				<div class="relative flex-1">
					<iconify-icon
						icon="mdi:magnify"
						width="24"
						class="pointer-events-none absolute inset-s-3 top-1/2 -translate-y-1/2 text-gray-400"
					></iconify-icon>
					<Input
						type="search"
						bind:value={searchQuery}
						placeholder={wd_search_placeholder()}
						inputClass="py-2 ps-10 pe-10"
					/>
					{#if searchQuery}
						<button
							onclick={() => (searchQuery = '')}
							class="absolute inset-e-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
							aria-label={wd_clear_search_aria()}
							title={wd_clear_search()}
						>
							<iconify-icon icon="mdi:close-circle" width="20"></iconify-icon>
						</button>
					{/if}
				</div>
			</div>

			<!-- Badges Counts -->
			<div class="flex flex-wrap gap-2">
				{#each [{ value: 'all' as const, label: 'All', count: stats.total, icon: 'mdi:widgets' }, { value: 'active' as const, label: 'Active', count: stats.active, icon: 'mdi:check-circle' }, { value: 'inactive' as const, label: 'Inactive', count: stats.inactive, icon: 'mdi:pause-circle' }, { value: 'core' as const, label: 'Core', count: stats.core, icon: 'mdi:puzzle' }, { value: 'custom' as const, label: 'Custom', count: stats.custom, icon: 'mdi:puzzle-plus' }] as filter (filter.value)}
					<Button
						variant="tertiary"
						onclick={() => (activeFilter = filter.value)}
						aria-label={wd_filter_aria({ filter: filter.label, count: filter.count })}
						class={activeFilter === filter.value ? 'text-white' : ''}
					>
						<iconify-icon icon={filter.icon} width="20"></iconify-icon>
						<span>{filter.label}</span>
						<span
							class="rounded-full px-2 py-0.5 text-xs font-semibold {activeFilter === filter.value
								? 'bg-tertiary-500 text-white'
								: 'bg-gray-300 text-gray-700 dark:bg-gray-600 dark:text-gray-300'}"
						>
							{filter.count}
						</span>
					</Button>
				{/each}
			</div>
		</div>
		<!-- Widgets Grid - 2 Column Layout for Desktop -->
		<div class="mb-12 grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="widget-grid">
			{#if filteredWidgets.length === 0}
				<div
					class="col-span-full rounded-xl border-2 border-dashed border-surface-500/30 bg-surface-500/10 p-12 text-center dark:border-surface-500/40 dark:bg-surface-800/50"
				>
					<iconify-icon icon="mdi:help-circle" width="64" class="mx-auto text-6xl text-surface-400"
					></iconify-icon>
					<h3 class="mt-4 text-lg font-semibold text-surface-900 dark:text-surface-100">
						{wd_no_widgets()}
					</h3>
					<p class="mt-2 text-surface-600 dark:text-surface-400">
						{#if searchQuery}
							{wd_no_match_part1()}"<strong>{searchQuery}</strong>"
						{:else if activeFilter !== 'all'}
							{wd_no_filter_part1()}{activeFilter}{wd_no_filter_part2()}
						{:else}
							{wd_no_criteria()}
						{/if}
					</p>
					{#if searchQuery || activeFilter !== 'all'}
						<button
							onclick={() => {
								searchQuery = '';
								activeFilter = 'all';
							}}
							class="mt-6 inline-flex items-center gap-2 rounded bg-tertiary-600 px-6 py-3 text-sm font-medium text-white hover:bg-tertiary-700 focus:outline-none focus:ring-2 focus:ring-tertiary-500 focus:ring-offset-2"
							aria-label={wd_clear_all_filters_aria()}
						>
							<iconify-icon icon="mdi:filter-off" width="24" class="text-lg"></iconify-icon>
							{wd_clear_all_filters()}
						</button>
					{/if}
				</div>
			{:else}
				{#each filteredWidgets as widget (widget.name)}
					<WidgetCard
						{widget}
						onToggle={toggleWidget}
						onUninstall={promptUninstall}
						canManage={canManageWidgets}
					/>
				{/each}
			{/if}
		</div>
	{/if}
</div>

<Modal bind:open={uninstallConfirmOpen} title={wd_uninstall_modal_title()} size="sm">
	<div class="flex flex-col gap-4">
		<p class="text-sm text-surface-600 dark:text-surface-400">
			{wd_uninstall_confirm_part1()}
			<strong>{uninstallTarget}</strong>{wd_uninstall_confirm_part2()}
		</p>
		<div class="flex justify-end gap-2">
			<Button variant="outline" size="sm" onclick={() => (uninstallConfirmOpen = false)}>
				{button_cancel()}
			</Button>
			<Button variant="error" size="sm" onclick={performUninstall}>{wd_uninstall()}</Button>
		</div>
	</div>
</Modal>
