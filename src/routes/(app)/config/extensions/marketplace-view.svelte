<!--
@file src/routes/(app)/config/extensions/marketplace-view.svelte
@component
**In-app marketplace catalog (Phase 2)** — browse remote + local packages offline-first.

### Features
- Search / type filter
- Remote catalog via marketplace-client (cached) with local fallback
- One-click remote install with checksum + license checkout
- Package detail and license modals
- Stable data-testids for E2E
-->

<script lang="ts">
	import AdminCard from '@components/admin-card.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import Modal from '@components/ui/modal.svelte';
	import {
		mp_activate_license,
		mp_details,
		mp_downloads,
		mp_enter_license_part1,
		mp_enter_license_part2,
		mp_installed,
		mp_install,
		mp_license_key,
		mp_license_key_aria,
		mp_license_key_placeholder,
		mp_license_modal_title,
		mp_loading_catalog,
		mp_no_packages,
		mp_offline,
		mp_open_checkout,
		mp_open_full_site,
		mp_open_listing,
		mp_remote_online,
		mp_save_install,
		mp_search,
		mp_search_aria,
		mp_search_placeholder,
		mp_source,
		mp_type,
		mp_version_sep,
		mp_view
	} from '@src/paraglide/messages';
	import { onMount } from 'svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { fetchApi } from '@utils/http-client';

	interface CatalogItem {
		id: string;
		name: string;
		description: string;
		version: string;
		author: string;
		type: string;
		icon?: string;
		category?: string;
		status?: string;
		source?: string;
		installed?: boolean;
		installable?: boolean;
		homepageUrl?: string;
		rating?: number;
		downloads?: number;
		price?: number;
		license?: string;
	}

	let items = $state<CatalogItem[]>([]);
	let loading = $state(false);
	let query = $state('');
	let typeFilter = $state('all');
	let remoteAvailable = $state(false);
	let source = $state<'local' | 'remote' | 'mixed'>('local');
	let installingId = $state<string | null>(null);
	let detailItem = $state<CatalogItem | null>(null);
	let detailOpen = $state(false);
	let licenseOpen = $state(false);
	let licenseKey = $state('');
	let licenseTarget = $state<CatalogItem | null>(null);

	const typeOptions = [
		{ value: 'all', label: 'All types' },
		{ value: 'plugin', label: 'Plugins' },
		{ value: 'widget', label: 'Widgets' },
		{ value: 'dashboard', label: 'Dashboard widgets' },
		{ value: 'theme', label: 'Themes' },
		{ value: 'preset', label: 'Presets' }
	];

	async function loadCatalog() {
		loading = true;
		try {
			const params = new URLSearchParams();
			if (query.trim()) params.set('search', query.trim());
			if (typeFilter !== 'all') params.set('type', typeFilter);
			const res = await fetch(`/api/marketplace?${params.toString()}`, {
				headers: { Accept: 'application/json' }
			});
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			const body = await res.json();
			const payload = body?.data ?? body;
			items = Array.isArray(payload?.items) ? payload.items : [];
			remoteAvailable = !!payload?.remoteAvailable;
			source =
				payload?.source === 'remote' ? 'remote' : payload?.source === 'mixed' ? 'mixed' : 'local';
		} catch (err) {
			toast.error({
				title: 'Marketplace',
				description: err instanceof Error ? err.message : 'Failed to load catalog'
			});
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadCatalog().catch(() => {});
	});

	async function installItem(item: CatalogItem, key?: string) {
		if (item.installed) return;
		installingId = item.id;
		try {
			const res = await fetchApi<{
				licenseRequired?: boolean;
				package?: { version?: string };
			}>('/api/marketplace/install', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({
					itemId: item.id,
					type: item.type,
					licenseKey: key || undefined
				})
			});
			if (!res.success) {
				throw new Error(res.message || res.error || 'Install failed');
			}
			// Some endpoints spread their payload at the top level (`{ success, ...data }`),
			// others nest it under `data` — accept both, as the previous parse did.
			const payload = (res.data ?? res) as {
				licenseRequired?: boolean;
				package?: { version?: string };
			};
			if (payload?.licenseRequired) {
				licenseTarget = item;
				licenseOpen = true;
				toast.warning({
					title: 'License required',
					description: 'Enter a license key or continue to checkout.'
				});
				return;
			}
			toast.success({
				title: 'Installed',
				description: `${item.name} ${payload?.package?.version ? 'v' + payload.package.version : ''} is ready. Restart the dev server if it does not appear.`
			});
			item.installed = true;
			await loadCatalog();
		} catch (err) {
			toast.error({
				title: 'Install failed',
				description: err instanceof Error ? err.message : 'Could not install package'
			});
		} finally {
			installingId = null;
		}
	}

	async function submitLicense() {
		if (!licenseKey.trim()) return;
		try {
			const res = await fetchApi<unknown>('/api/marketplace/license', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({
					licenseKey: licenseKey.trim(),
					pluginId: licenseTarget?.id
				})
			});
			if (!res.success) throw new Error(res.message || res.error || 'License check failed');
			licenseOpen = false;
			if (licenseTarget) await installItem(licenseTarget, licenseKey.trim());
		} catch (err) {
			toast.error({
				title: 'License',
				description: err instanceof Error ? err.message : 'Could not save license'
			});
		}
	}
</script>

<div class="flex flex-col gap-4" data-testid="marketplace-catalog">
	<div class="flex flex-wrap items-end gap-3">
		<div class="min-w-50 flex-1">
			<label class="mb-1 block text-xs font-medium text-surface-500" for="mp-search"
				>{mp_search()}</label
			>
			<Input
				id="mp-search"
				bind:value={query}
				placeholder={mp_search_placeholder()}
				aria-label={mp_search_aria()}
				data-testid="marketplace-search"
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Enter') loadCatalog();
				}}
			/>
		</div>
		<div class="w-40">
			<label class="mb-1 block text-xs font-medium text-surface-500" for="mp-type"
				>{mp_type()}</label
			>
			<Select
				id="mp-type"
				bind:value={typeFilter}
				options={typeOptions}
				onchange={() => loadCatalog()}
				data_testid="marketplace-type-filter"
			/>
		</div>
		<Button variant="primary" onclick={() => loadCatalog()} data-testid="marketplace-refresh">
			{loading ? 'Loading…' : 'Refresh'}
		</Button>
		<a
			href="https://marketplace.sveltycms.com"
			target="_blank"
			rel="noopener noreferrer"
			class="text-sm text-tertiary-600 underline dark:text-primary-400"
			data-testid="marketplace-external"
		>
			{mp_open_full_site()}
		</a>
	</div>

	<div class="flex items-center gap-2 text-xs text-surface-500" data-testid="marketplace-source">
		<span>{mp_source()}</span>
		<Badge variant="outline">{source}</Badge>
		{#if remoteAvailable}
			<Badge variant="success">{mp_remote_online()}</Badge>
		{:else}
			<Badge variant="warning">{mp_offline()}</Badge>
		{/if}
	</div>

	{#if loading && items.length === 0}
		<p class="py-12 text-center text-sm text-surface-500" data-testid="marketplace-loading">
			{mp_loading_catalog()}
		</p>
	{:else if items.length === 0}
		<p class="py-12 text-center text-sm text-surface-500" data-testid="marketplace-empty">
			{mp_no_packages()}
		</p>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="marketplace-grid">
			{#each items as item (item.id)}
				<AdminCard class="flex flex-col gap-3 p-4" data-testid={`marketplace-card-${item.id}`}>
					<div class="flex items-start justify-between gap-3">
						<div class="flex items-start gap-3 min-w-0">
							<div
								class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-500/10 dark:bg-surface-800 text-tertiary-500 dark:text-primary-500"
							>
								<iconify-icon
									icon={item.icon ||
										(item.type === 'widget'
											? 'mdi:widgets'
											: item.type === 'dashboard'
												? 'mdi:view-dashboard'
												: item.type === 'theme'
													? 'mdi:palette'
													: 'mdi:puzzle')}
									width="24"
									aria-hidden="true"
								></iconify-icon>
							</div>
							<div class="min-w-0">
								<h3 class="font-semibold text-surface-900 dark:text-surface-100 truncate">
									{item.name}
								</h3>
								<p class="text-xs text-surface-500 truncate">
									{item.author}
									{mp_version_sep()}{item.version}
									{#if item.category}
										<span class="opacity-60">· {item.category}</span>
									{/if}
								</p>
							</div>
						</div>
						<div class="flex flex-col items-end gap-1 shrink-0">
							<Badge variant="outline">{item.type}</Badge>
							{#if item.license}
								<Badge
									variant={item.license === 'free'
										? 'success'
										: item.license === 'paid'
											? 'warning'
											: 'tertiary'}
									size="sm"
									data-testid={`marketplace-license-${item.id}`}
								>
									{item.license === 'free' ? 'Free' : item.license === 'paid' ? 'Paid' : 'Freemium'}
								</Badge>
							{/if}
							{#if item.price != null && item.price > 0}
								<span class="text-xs font-semibold text-surface-600 dark:text-surface-400">
									€{item.price.toFixed(2)}
								</span>
							{/if}
						</div>
					</div>
					<p class="line-clamp-3 flex-1 text-sm text-surface-600 dark:text-surface-400">
						{item.description || 'No description'}
					</p>
					<div class="flex flex-wrap items-center gap-2">
						{#if item.installed}
							<Badge variant="success">{mp_installed()}</Badge>
						{/if}
						{#if item.homepageUrl}
							<a
								href={item.homepageUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="text-xs text-tertiary-600 underline dark:text-primary-400"
							>
								{mp_details()}
							</a>
						{/if}
						{#if item.downloads != null}
							<span class="text-xs text-surface-500">{item.downloads} {mp_downloads()}</span>
						{/if}
						<Button
							variant="ghost"
							size="sm"
							onclick={() => {
								detailItem = item;
								detailOpen = true;
							}}
							data-testid={`marketplace-detail-${item.id}`}
						>
							{mp_view()}
						</Button>
						{#if !item.installed && item.installable !== false && item.source === 'remote'}
							<Button
								variant="primary"
								size="sm"
								loading={installingId === item.id}
								onclick={() => installItem(item)}
								data-testid={`marketplace-install-${item.id}`}
							>
								{mp_install()}
							</Button>
						{:else if item.license === 'paid' && !item.installed}
							<Button
								variant="outline"
								size="sm"
								onclick={() => {
									licenseTarget = item;
									licenseOpen = true;
								}}
								data-testid={`marketplace-license-cta-${item.id}`}
							>
								{mp_activate_license()}
							</Button>
						{/if}
					</div>
				</AdminCard>
			{/each}
		</div>
	{/if}
</div>

<Modal bind:open={licenseOpen} title={mp_license_modal_title()} size="md">
	<div class="flex flex-col gap-3">
		<p class="text-sm text-surface-600 dark:text-surface-400">
			{mp_enter_license_part1()}
			{licenseTarget?.name ?? 'this package'}
			{mp_enter_license_part2()}
		</p>
		<label class="text-xs font-medium text-surface-500" for="mp-license-key"
			>{mp_license_key()}</label
		>
		<Input
			id="mp-license-key"
			bind:value={licenseKey}
			placeholder={mp_license_key_placeholder()}
			aria-label={mp_license_key_aria()}
			data-testid="marketplace-license-key"
		/>
		<div class="flex flex-wrap gap-2">
			<Button
				variant="primary"
				onclick={() => submitLicense()}
				data-testid="marketplace-license-save"
			>
				{mp_save_install()}
			</Button>
			{#if licenseTarget}
				<a
					href="https://marketplace.sveltycms.com/checkout?package={encodeURIComponent(
						licenseTarget.id
					)}"
					target="_blank"
					rel="noopener noreferrer"
					class="text-sm text-tertiary-600 underline dark:text-primary-400 self-center"
				>
					{mp_open_checkout()}
				</a>
			{/if}
		</div>
	</div>
</Modal>

<Modal
	bind:open={detailOpen}
	title={detailItem?.name ?? 'Package'}
	size="lg"
	onclose={() => {
		detailItem = null;
	}}
>
	{#if detailItem}
		<div class="flex flex-col gap-4" data-testid="marketplace-package-detail">
			<div class="flex items-center gap-4 border-b border-(--admin-border-default) pb-4">
				<div
					class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-500/10 dark:bg-surface-800 text-tertiary-500 dark:text-primary-500"
				>
					<iconify-icon
						icon={detailItem.icon ||
							(detailItem.type === 'widget'
								? 'mdi:widgets'
								: detailItem.type === 'dashboard'
									? 'mdi:view-dashboard'
									: detailItem.type === 'theme'
										? 'mdi:palette'
										: 'mdi:puzzle')}
						width="32"
						aria-hidden="true"
					></iconify-icon>
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2">
						<h3 class="text-lg font-bold text-surface-900 dark:text-surface-100">
							{detailItem.name}
						</h3>
						<Badge variant="outline">{detailItem.type}</Badge>
						{#if detailItem.license}
							<Badge
								variant={detailItem.license === 'free'
									? 'success'
									: detailItem.license === 'paid'
										? 'warning'
										: 'tertiary'}
								size="sm"
							>
								{detailItem.license === 'free'
									? 'Free'
									: detailItem.license === 'paid'
										? 'Paid'
										: 'Freemium'}
							</Badge>
						{/if}
					</div>
					<p class="text-xs text-surface-500 mt-1">
						{detailItem.author}
						{mp_version_sep()}v{detailItem.version}
						{#if detailItem.category}
							<span>· Category: {detailItem.category}</span>
						{/if}
						{#if detailItem.price != null && detailItem.price > 0}
							<span>· €{detailItem.price.toFixed(2)}</span>
						{/if}
					</p>
				</div>
			</div>

			<div class="space-y-2">
				<h4 class="text-xs font-semibold text-(--admin-text-muted) uppercase tracking-wider">
					Description
				</h4>
				<p class="text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
					{detailItem.description || 'No detailed description available.'}
				</p>
			</div>

			<div
				class="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-lg border border-(--admin-border-default) bg-surface-500/10 p-3 text-xs"
			>
				<div>
					<span class="block text-surface-500">Package ID</span>
					<span class="font-mono font-medium text-surface-600 dark:text-surface-400"
						>{detailItem.id}</span
					>
				</div>
				<div>
					<span class="block text-surface-500">Type</span>
					<span class="font-medium capitalize text-surface-600 dark:text-surface-400"
						>{detailItem.type}</span
					>
				</div>
				<div>
					<span class="block text-surface-500">Installation Status</span>
					{#if detailItem.installed}
						<span class="font-semibold text-success-600 dark:text-success-400">Installed</span>
					{:else}
						<span class="text-surface-500">Not Installed</span>
					{/if}
				</div>
			</div>

			<div class="flex items-center justify-end gap-3 pt-2">
				{#if detailItem.homepageUrl}
					<Button
						variant="surface"
						href={detailItem.homepageUrl}
						target="_blank"
						rel="noopener noreferrer"
						size="sm"
					>
						<iconify-icon icon="mdi:open-in-new" width="16"></iconify-icon>
						<span>{mp_open_listing()}</span>
					</Button>
				{/if}
				{#if !detailItem.installed && detailItem.installable !== false}
					<Button variant="primary" onclick={() => detailItem && installItem(detailItem)} size="sm">
						<iconify-icon icon="mdi:download" width="16"></iconify-icon>
						<span>{mp_install()}</span>
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</Modal>
