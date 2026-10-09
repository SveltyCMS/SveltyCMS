<!--
@file src/routes/(app)/config/extensions/dashboard-widgets-view.svelte
@component DashboardWidgetsView — browse, filter, and inspect installed dashboard widget packages.

### Features:
- Filter by search query, category, and license tier
- Summary stats cards for installed dashboard widgets
- Detail modal with full technical metadata, layout sizes, and docs links
- Accessible WCAG 2.2 AA, RTL-compliant, Svelte 5 runes
-->

<script lang="ts">
	import AdminCard from '@components/admin-card.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Modal from '@components/ui/modal.svelte';
	import {
		button_close,
		dwv_author,
		dwv_cms_compat,
		dwv_default_grid,
		dwv_empty,
		dwv_empty_hint,
		dwv_free_tier,
		dwv_freemium_trial,
		dwv_grid,
		dwv_grid_cols,
		dwv_grid_rows,
		dwv_heading,
		dwv_inspect,
		dwv_intro,
		dwv_license_model,
		dwv_monitoring,
		dwv_plugin_label,
		dwv_plugin_req_part1,
		dwv_plugin_req_part2,
		dwv_search_aria,
		dwv_search_placeholder,
		dwv_total_widgets,
		dwv_version_sep
	} from '@src/paraglide/messages';

	interface DashboardWidgetManifest {
		id: string;
		name: string;
		description?: string;
		icon: string;
		version: string;
		sveltycms: string;
		type: 'dashboard-widget';
		author: string;
		license: 'free' | 'freemium' | 'paid';
		price?: number;
		component: string;
		defaultSize: { w: number; h: number };
		category?: 'monitoring' | 'logs' | 'content' | 'static';
		requiresPlugin?: string;
	}

	interface Props {
		data: {
			dashboardWidgets?: DashboardWidgetManifest[];
			[key: string]: any;
		};
	}

	let { data }: Props = $props();

	let searchQuery = $state('');
	let categoryFilter = $state<'all' | 'monitoring' | 'logs' | 'content' | 'static'>('all');
	let licenseFilter = $state<'all' | 'free' | 'freemium' | 'paid'>('all');
	let detailWidget = $state<DashboardWidgetManifest | null>(null);
	let detailOpen = $state(false);

	const widgets = $derived<DashboardWidgetManifest[]>(data?.dashboardWidgets ?? []);

	const stats = $derived({
		total: widgets.length,
		free: widgets.filter((w) => w.license === 'free').length,
		freemium: widgets.filter((w) => w.license === 'freemium').length,
		monitoring: widgets.filter((w) => w.category === 'monitoring').length,
		content: widgets.filter((w) => w.category === 'content').length
	});

	const filteredWidgets = $derived(
		widgets.filter((w) => {
			const query = searchQuery.trim().toLowerCase();
			const matchesQuery =
				!query ||
				w.name.toLowerCase().includes(query) ||
				w.id.toLowerCase().includes(query) ||
				(w.description?.toLowerCase().includes(query) ?? false);

			const matchesCategory =
				categoryFilter === 'all' || (w.category && w.category === categoryFilter);

			const matchesLicense = licenseFilter === 'all' || w.license === licenseFilter;

			return matchesQuery && matchesCategory && matchesLicense;
		})
	);

	function openDetail(w: DashboardWidgetManifest) {
		detailWidget = w;
		detailOpen = true;
	}
</script>

<div class="flex flex-col gap-6" data-testid="dashboard-widgets-view">
	<div class="flex flex-col gap-2">
		<h2 class="text-lg font-bold text-surface-900 dark:text-surface-100">
			{dwv_heading()}
		</h2>
		<p class="text-sm text-surface-500 dark:text-surface-400">
			{dwv_intro()}
		</p>
	</div>

	<!-- Stats Summary Grid -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="dashboard-widgets-stats">
		<AdminCard
			class="flex items-center gap-3.5 p-4 bg-white dark:bg-surface-800/60 border border-surface-500/20"
		>
			<div
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-400"
			>
				<iconify-icon icon="mdi:view-dashboard" width="22" aria-hidden="true"></iconify-icon>
			</div>
			<div>
				<p class="text-xs font-medium text-surface-500">{dwv_total_widgets()}</p>
				<p class="text-xl font-bold text-surface-900 dark:text-surface-100">{stats.total}</p>
			</div>
		</AdminCard>

		<AdminCard
			class="flex items-center gap-3.5 p-4 bg-white dark:bg-surface-800/60 border border-surface-500/20"
		>
			<div
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-success-500/10 text-success-600 dark:text-success-400"
			>
				<iconify-icon icon="mdi:gift-outline" width="22" aria-hidden="true"></iconify-icon>
			</div>
			<div>
				<p class="text-xs font-medium text-surface-500">{dwv_free_tier()}</p>
				<p class="text-xl font-bold text-surface-900 dark:text-surface-100">{stats.free}</p>
			</div>
		</AdminCard>

		<AdminCard
			class="flex items-center gap-3.5 p-4 bg-white dark:bg-surface-800/60 border border-surface-500/20"
		>
			<div
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-tertiary-500/10 text-tertiary-600 dark:text-tertiary-400"
			>
				<iconify-icon icon="mdi:star-outline" width="22" aria-hidden="true"></iconify-icon>
			</div>
			<div>
				<p class="text-xs font-medium text-surface-500">{dwv_freemium_trial()}</p>
				<p class="text-xl font-bold text-surface-900 dark:text-surface-100">{stats.freemium}</p>
			</div>
		</AdminCard>

		<AdminCard
			class="flex items-center gap-3.5 p-4 bg-white dark:bg-surface-800/60 border border-surface-500/20"
		>
			<div
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary-500/10 text-secondary-600 dark:text-secondary-400"
			>
				<iconify-icon icon="mdi:chart-line" width="22" aria-hidden="true"></iconify-icon>
			</div>
			<div>
				<p class="text-xs font-medium text-surface-500">{dwv_monitoring()}</p>
				<p class="text-xl font-bold text-surface-900 dark:text-surface-100">{stats.monitoring}</p>
			</div>
		</AdminCard>
	</div>

	<!-- Search & Filters -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex min-w-64 flex-1 items-center gap-2">
			<Input
				bind:value={searchQuery}
				placeholder={dwv_search_placeholder()}
				aria-label={dwv_search_aria()}
				data-testid="dashboard-widgets-search"
			/>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<!-- Category filter buttons -->
			<div
				class="flex items-center rounded-lg border border-surface-500/20 p-0.5 bg-surface-500/10"
			>
				{#each [{ id: 'all', label: 'All' }, { id: 'monitoring', label: 'Monitoring' }, { id: 'logs', label: 'Logs' }, { id: 'content', label: 'Content' }, { id: 'static', label: 'Static' }] as cat (cat.id)}
					<button
						type="button"
						onclick={() => (categoryFilter = cat.id as any)}
						class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors {categoryFilter ===
						cat.id
							? 'bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 shadow-xs'
							: 'text-surface-600 dark:text-surface-400 hover:text-surface-900'}"
					>
						{cat.label}
					</button>
				{/each}
			</div>

			<!-- License filter buttons -->
			<div
				class="flex items-center rounded-lg border border-surface-500/20 p-0.5 bg-surface-500/10"
			>
				{#each [{ id: 'all', label: 'All Tiers' }, { id: 'free', label: 'Free' }, { id: 'freemium', label: 'Freemium' }] as lic (lic.id)}
					<button
						type="button"
						onclick={() => (licenseFilter = lic.id as any)}
						class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors {licenseFilter ===
						lic.id
							? 'bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 shadow-xs'
							: 'text-surface-600 dark:text-surface-400 hover:text-surface-900'}"
					>
						{lic.label}
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Widgets Grid -->
	{#if filteredWidgets.length === 0}
		<div
			class="flex flex-col items-center justify-center py-16 text-center text-surface-400"
			data-testid="dashboard-widgets-empty"
		>
			<iconify-icon icon="mdi:view-dashboard-outline" width="48" class="mb-2 opacity-50"
			></iconify-icon>
			<p class="text-base font-medium">{dwv_empty()}</p>
			<p class="text-xs text-surface-500">
				{dwv_empty_hint()}
			</p>
		</div>
	{:else}
		<div
			class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
			data-testid="dashboard-widgets-grid"
		>
			{#each filteredWidgets as widget (widget.id)}
				<AdminCard
					class="flex flex-col justify-between p-5 bg-white dark:bg-surface-800/80 border border-surface-500/20 hover:border-surface-500/40 transition-shadow shadow-xs hover:shadow-md"
					data-testid={`dashboard-widget-card-${widget.id}`}
				>
					<div class="flex flex-col gap-3">
						<div class="flex items-start justify-between gap-3">
							<div class="flex items-center gap-3">
								<div
									class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-500/10 text-primary-600 dark:bg-surface-700/60 dark:text-primary-400"
								>
									<iconify-icon
										icon={widget.icon || 'mdi:view-dashboard'}
										width="24"
										aria-hidden="true"
									></iconify-icon>
								</div>
								<div>
									<h3 class="font-bold text-surface-900 dark:text-surface-100 leading-tight">
										{widget.name}
									</h3>
									<p class="text-xs text-surface-500 font-mono">
										v{widget.version} · {widget.id}
									</p>
								</div>
							</div>

							<Badge
								variant={widget.license === 'free'
									? 'success'
									: widget.license === 'freemium'
										? 'tertiary'
										: 'warning'}
								size="sm"
							>
								{widget.license === 'free'
									? 'Free'
									: widget.license === 'freemium'
										? 'Freemium'
										: 'Paid'}
							</Badge>
						</div>

						<p class="text-xs text-surface-600 dark:text-surface-400 line-clamp-2 min-h-8">
							{widget.description || 'No description provided.'}
						</p>

						<div class="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
							{#if widget.category}
								<Badge variant="surface" size="sm" class="capitalize">
									{widget.category}
								</Badge>
							{/if}
							<Badge variant="outline" size="sm">
								{widget.defaultSize.w} × {widget.defaultSize.h}
								{dwv_grid()}
							</Badge>
							{#if widget.requiresPlugin}
								<Badge variant="warning" size="sm" class="flex items-center gap-1">
									<iconify-icon icon="mdi:puzzle-outline" width="12" aria-hidden="true"
									></iconify-icon>
									{dwv_plugin_label()}
									{widget.requiresPlugin}
								</Badge>
							{/if}
						</div>
					</div>

					<div class="mt-4 flex items-center justify-between border-t border-surface-500/15 pt-3">
						<span class="text-[11px] text-surface-400">
							CMS {widget.sveltycms}
						</span>
						<Button
							variant="ghost"
							size="sm"
							onclick={() => openDetail(widget)}
							data-testid={`dashboard-widget-inspect-${widget.id}`}
						>
							{dwv_inspect()}
						</Button>
					</div>
				</AdminCard>
			{/each}
		</div>
	{/if}
</div>

<!-- Widget Detail Modal -->
<Modal
	bind:open={detailOpen}
	title={detailWidget ? `${detailWidget.name} (Dashboard Widget)` : 'Widget Details'}
	size="md"
	onclose={() => {
		detailWidget = null;
	}}
>
	{#if detailWidget}
		<div class="flex flex-col gap-4" data-testid="dashboard-widget-detail-modal">
			<div class="flex items-center gap-3">
				<div
					class="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-500/10 text-primary-500 dark:bg-surface-700"
				>
					<iconify-icon icon={detailWidget.icon || 'mdi:view-dashboard'} width="28"></iconify-icon>
				</div>
				<div>
					<h3 class="text-base font-bold text-surface-900 dark:text-surface-100">
						{detailWidget.name}
					</h3>
					<p class="text-xs text-surface-500">
						ID: {detailWidget.id}
						{dwv_version_sep()}
						{detailWidget.version}
					</p>
				</div>
			</div>

			<p class="text-sm text-surface-600 dark:text-surface-400">
				{detailWidget.description || 'No description provided.'}
			</p>

			<div
				class="grid grid-cols-2 gap-3 rounded-lg border border-surface-500/20 bg-surface-500/10 p-3 text-xs"
			>
				<div>
					<span class="text-surface-500 block">{dwv_author()}</span>
					<span class="font-medium text-surface-600 dark:text-surface-400"
						>{detailWidget.author || 'SveltyCMS'}</span
					>
				</div>
				<div>
					<span class="text-surface-500 block">{dwv_license_model()}</span>
					<span class="font-medium capitalize text-surface-600 dark:text-surface-400">
						{detailWidget.license}
						{detailWidget.price ? `(€${detailWidget.price.toFixed(2)})` : ''}
					</span>
				</div>
				<div>
					<span class="text-surface-500 block">{dwv_cms_compat()}</span>
					<span class="font-mono text-surface-600 dark:text-surface-400"
						>{detailWidget.sveltycms}</span
					>
				</div>
				<div>
					<span class="text-surface-500 block">{dwv_default_grid()}</span>
					<span class="font-medium text-surface-600 dark:text-surface-400"
						>{detailWidget.defaultSize.w}
						{dwv_grid_cols()}
						{detailWidget.defaultSize.h}
						{dwv_grid_rows()}</span
					>
				</div>
			</div>

			{#if detailWidget.requiresPlugin}
				<div
					class="flex items-center gap-2 rounded-lg bg-warning-500/10 p-2.5 text-xs text-warning-600 dark:text-warning-400"
				>
					<iconify-icon icon="mdi:alert-circle-outline" width="16"></iconify-icon>
					<span
						>{dwv_plugin_req_part1()} <strong>{detailWidget.requiresPlugin}</strong>{' '}
						{dwv_plugin_req_part2()}</span
					>
				</div>
			{/if}

			<div class="flex justify-end gap-2 pt-2">
				<Button variant="outline" size="sm" onclick={() => (detailOpen = false)}
					>{button_close()}</Button
				>
			</div>
		</div>
	{/if}
</Modal>
