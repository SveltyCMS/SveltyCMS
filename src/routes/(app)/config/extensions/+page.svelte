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
	import Modal from '@components/ui/modal.svelte';
	import Input from '@components/ui/input.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { fetchApi } from '@utils/http-client';
	import { extensions_categories_aria, extensions_title } from '@src/paraglide/messages';
	import PluginsView from './plugins-view.svelte';
	import WidgetDashboard from './widget-dashboard.svelte';
	import DashboardWidgetsView from './dashboard-widgets-view.svelte';
	import MarketplaceView from './marketplace-view.svelte';
	import { TAB_RULE, TAB_STRIP_FLUSH, tabTrigger } from '@components/ui/tabs/chrome';

	let { data }: { data: any } = $props();

	let activeTab = $state('plugins');
	let isLicenseModalOpen = $state(false);
	let masterLicenseKey = $state('');
	let isSavingLicense = $state(false);

	const tabs = [
		{ id: 'plugins', label: 'Plugins', icon: 'mdi:puzzle' },
		{ id: 'widgets', label: 'Content Widgets', icon: 'mdi:widgets' },
		{ id: 'dashboard', label: 'Dashboard Widgets', icon: 'mdi:view-dashboard-outline' },
		{ id: 'marketplace', label: 'Marketplace', icon: 'mdi:store' }
	] as const;

	async function saveMasterLicense() {
		if (!masterLicenseKey.trim()) return;
		isSavingLicense = true;
		try {
			const res = await fetchApi<unknown>('/api/marketplace/license', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({ licenseKey: masterLicenseKey.trim() })
			});
			if (!res.success) {
				throw new Error(res.message || res.error || 'Failed to save license key');
			}
			toast.success({
				title: 'License Activated',
				description: 'Marketplace extensions master license key saved and verified.'
			});
			isLicenseModalOpen = false;
			masterLicenseKey = '';
		} catch (err) {
			toast.error({
				title: 'License Error',
				description: err instanceof Error ? err.message : 'Failed to save license key'
			});
		} finally {
			isSavingLicense = false;
		}
	}
</script>

<AdminPageShell
	title={extensions_title()}
	icon="mdi:puzzle-outline"
	description="Install and manage plugins, widgets, and marketplace extensions"
	showBackButton={true}
	backUrl="/config"
	fullHeight
>
	{#snippet actions()}
		<Button
			variant="tertiary"
			onclick={() => (isLicenseModalOpen = true)}
			data-testid="extensions-activate-license"
			class="flex items-center gap-1.5"
		>
			<iconify-icon icon="mdi:key-outline" width="18" aria-hidden="true"></iconify-icon>
			<span>Activate License</span>
		</Button>
	{/snippet}
	<div data-testid="extensions-page" class="contents">
		<AdminCard
			class="flex min-h-0 flex-1 flex-col border border-(--admin-border-default) bg-(--admin-bg-card) backdrop-blur-md shadow-xs p-6"
		>
			<div class="mb-4 flex shrink-0 items-center justify-between {TAB_RULE}">
				<div
					class={TAB_STRIP_FLUSH}
					role="tablist"
					aria-label={extensions_categories_aria()}
					data-testid="extensions-tabs"
				>
					{#each tabs as tab (tab.id)}
						<Button
							variant="transparent"
							onclick={() => (activeTab = tab.id)}
							class={tabTrigger(activeTab === tab.id)}
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
							{:else if tab.id === 'widgets' && data?.widgets?.length}
								<Badge variant="surface" size="sm" class="ms-1.5 font-normal"
									>{data.widgets.length}</Badge
								>
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
			</div>

			<div
				class="min-h-0 flex-1 overflow-y-auto"
				data-testid={`extensions-panel-${activeTab}`}
				role="tabpanel"
			>
				{#if activeTab === 'plugins'}
					<PluginsView {data} />
				{:else if activeTab === 'widgets'}
					<WidgetDashboard {data} initialWidgets={data.widgets} />
				{:else if activeTab === 'dashboard'}
					<DashboardWidgetsView {data} />
				{:else if activeTab === 'marketplace'}
					<!-- Fetched on mount: the catalog is remote and refreshable, and its
					     /api/marketplace route is the single source of truth. -->
					<MarketplaceView />
				{/if}
			</div>
		</AdminCard>
	</div>
</AdminPageShell>

<Modal bind:open={isLicenseModalOpen} title="Activate Marketplace License" size="md">
	<form
		class="flex flex-col gap-4"
		onsubmit={(e) => {
			e.preventDefault();
			saveMasterLicense();
		}}
	>
		<p class="text-sm text-(--admin-text-muted)">
			Enter your master license key from marketplace.sveltycms.com. One key activates all purchased
			plugins and widgets across your installation. <code
				class="text-xs bg-surface-500/10 px-1 py-0.5 rounded">SLM-DEMO-</code
			> keys grant a 14-day trial.
		</p>
		<div class="space-y-1">
			<label for="master-license-key-input" class="text-xs font-semibold text-(--admin-text-body)">
				Master License Key
			</label>
			<Input
				id="master-license-key-input"
				bind:value={masterLicenseKey}
				placeholder="SLM-XXXX-XXXX-XXXX"
				required
				data-testid="marketplace-master-license-input"
			/>
		</div>
		<div class="flex items-center justify-end gap-2 pt-2 border-t border-(--admin-border-default)">
			<Button
				variant="ghost"
				type="button"
				onclick={() => {
					isLicenseModalOpen = false;
					masterLicenseKey = '';
				}}
			>
				Cancel
			</Button>
			<Button
				variant="primary"
				type="submit"
				disabled={isSavingLicense || !masterLicenseKey.trim()}
				data-testid="marketplace-master-license-save"
			>
				{#if isSavingLicense}
					<iconify-icon icon="mdi:loading" width="16" class="animate-spin"></iconify-icon>
					<span>Activating...</span>
				{:else}
					<iconify-icon icon="mdi:check" width="16"></iconify-icon>
					<span>Activate License</span>
				{/if}
			</Button>
		</div>
	</form>
</Modal>
