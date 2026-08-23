<!--
@file src/routes/(app)/config/extensions/marketplace-view.svelte
@component
**In-app marketplace catalog (Phase 2)** — browse remote + local packages offline-first.

### Features
- Search / type filter
- Remote catalog via marketplace-client (cached) with local fallback
- Install / open homepage links
- Stable data-testids for E2E
-->

<script lang="ts">
	import AdminCard from '@components/admin-card.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import { onMount } from 'svelte';
	import { toast } from '@src/stores/toast.svelte.ts';

	interface CatalogItem {
		id: string;
		name: string;
		description: string;
		version: string;
		author: string;
		type: string;
		source?: string;
		installed?: boolean;
		installable?: boolean;
		homepageUrl?: string;
		rating?: number;
		downloads?: number;
		price?: number;
		license?: string;
	}

	let { initialItems = [] }: { initialItems?: CatalogItem[] } = $props();
		
	let items = $state<CatalogItem[]>([]);
	$effect(() => {
		items = [...initialItems];
	});
	let loading = $state(false);
	let query = $state('');
	let typeFilter = $state('all');
	let remoteAvailable = $state(false);
	let source = $state<'local' | 'remote' | 'mixed'>('local');

	const typeOptions = [
		{ value: 'all', label: 'All types' },
		{ value: 'plugin', label: 'Plugins' },
		{ value: 'widget', label: 'Widgets' },
		{ value: 'dashboard', label: 'Dashboard widgets' },
		{ value: 'theme', label: 'Themes' },
		{ value: 'preset', label: 'Presets' },
	];

	async function loadCatalog() {
		loading = true;
		try {
			const params = new URLSearchParams();
			if (query.trim()) params.set('search', query.trim());
			if (typeFilter !== 'all') params.set('type', typeFilter);
			const res = await fetch(`/api/marketplace?${params.toString()}`, {
				headers: { Accept: 'application/json' },
			});
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			const body = await res.json();
			const payload = body?.data ?? body;
			items = Array.isArray(payload?.items) ? payload.items : [];
			remoteAvailable = !!payload?.remoteAvailable;
			source = payload?.source === 'remote' ? 'remote' : payload?.source === 'mixed' ? 'mixed' : 'local';
		} catch (err) {
			toast.error({
				title: 'Marketplace',
				description: err instanceof Error ? err.message : 'Failed to load catalog',
			});
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadCatalog().catch(() => {});
	});
</script>

<div class="flex flex-col gap-4" data-testid="marketplace-catalog">
	<div class="flex flex-wrap items-end gap-3">
		<div class="min-w-50 flex-1">
			<label class="mb-1 block text-xs font-medium text-surface-500" for="mp-search">Search</label>
			<Input
				id="mp-search"
				bind:value={query}
				placeholder="Search packages…"
				aria-label="Search marketplace"
				data-testid="marketplace-search"
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Enter') loadCatalog();
				}}
			/>
		</div>
		<div class="w-40">
			<label class="mb-1 block text-xs font-medium text-surface-500" for="mp-type">Type</label>
			<Select
				id="mp-type"
				bind:value={typeFilter}
				options={typeOptions}
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
			Open full site
		</a>
	</div>

	<div class="flex items-center gap-2 text-xs text-surface-500" data-testid="marketplace-source">
		<span>Source:</span>
		<Badge variant="outline">{source}</Badge>
		{#if remoteAvailable}
			<Badge variant="success">Remote online</Badge>
		{:else}
			<Badge variant="warning">Offline / local catalog</Badge>
		{/if}
	</div>

	{#if loading && items.length === 0}
		<p class="py-12 text-center text-sm text-surface-500" data-testid="marketplace-loading">
			Loading catalog…
		</p>
	{:else if items.length === 0}
		<p class="py-12 text-center text-sm text-surface-500" data-testid="marketplace-empty">
			No packages found. Try another search or open the full marketplace.
		</p>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="marketplace-grid">
			{#each items as item (item.id)}
				<AdminCard class="flex flex-col gap-3 p-4" data-testid={`marketplace-card-${item.id}`}>
					<div class="flex items-start justify-between gap-2">
						<div>
							<h3 class="font-semibold text-surface-900 dark:text-surface-100">{item.name}</h3>
							<p class="text-xs text-surface-500">
								{item.author} · v{item.version}
							</p>
						</div>
						<div class="flex flex-col items-end gap-1">
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
									{item.license === 'free'
										? 'Free'
										: item.license === 'paid'
											? 'Paid'
											: 'Freemium'}
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
							<Badge variant="success">Installed</Badge>
						{/if}
						{#if item.homepageUrl}
							<a
								href={item.homepageUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="text-xs text-tertiary-600 underline dark:text-primary-400"
							>
								Details
							</a>
						{/if}
						{#if item.downloads != null}
							<span class="text-xs text-surface-500">{item.downloads} downloads</span>
						{/if}
					</div>
				</AdminCard>
			{/each}
		</div>
	{/if}
</div>
