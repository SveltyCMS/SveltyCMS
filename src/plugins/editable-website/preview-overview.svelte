<!--
@file src/plugins/editable-website/preview-overview.svelte
@component Live Preview overview dashboard — runtime status, preview configuration
coverage and an honest capability/gap report.

### Features
- License + protocol + endpoint health summary (one status row per check)
- Per-collection preview configuration read from `/api/collections`
- Capability matrix (SveltyCMS column) with yes / partial / no badges
- Open-gap list so the dashboard never overstates parity
- Accessible status announcements, logical-property spacing (RTL-safe)
-->

<script lang="ts">
	import AdminCard from '@components/admin-card.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Loader from '@components/ui/loader.svelte';
	import { logger } from '@utils/logger';
	import { onMount } from 'svelte';
	import {
		CAPABILITY_MATRIX,
		coveragePercent,
		LEVEL_BADGE_VARIANT,
		LEVEL_LABELS,
		MATRIX_REVIEWED_AT,
		MATRIX_SOURCE_NOTE,
		OPEN_GAPS
	} from './capabilities';
	import {
		EDITABLE_WEBSITE_PRICE,
		fetchEditableWebsiteLicense,
		type EditableWebsiteLicenseView
	} from './license-gate';
	import { PREVIEW_PROTOCOL_VERSION } from './protocol';

	interface PreviewCollection {
		id: string;
		name: string;
		livePreview: boolean | string;
	}

	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let license = $state<EditableWebsiteLicenseView & { loaded: boolean }>({
		active: false,
		daysRemaining: null,
		loaded: false
	});
	let collections = $state<PreviewCollection[]>([]);

	const configured = $derived(
		collections.filter(
			(collection) => collection.livePreview !== false && collection.livePreview !== ''
		)
	);
	const coverage = $derived(coveragePercent('svelty'));
	const yesCount = $derived(CAPABILITY_MATRIX.filter((row) => row.svelty === 'yes').length);

	/** Normalize the `/api/collections` envelope into the rows this page needs. */
	function toPreviewCollections(payload: unknown): PreviewCollection[] {
		const raw = Array.isArray(payload)
			? payload
			: Array.isArray((payload as { data?: unknown[] } | null)?.data)
				? (payload as { data: unknown[] }).data
				: [];
		return raw
			.map((entry) => {
				const item = entry as Record<string, unknown>;
				const id = String(item._id ?? item.name ?? '');
				const livePreview = item.livePreview;
				return {
					id,
					name: String(item.name ?? item._id ?? 'untitled'),
					livePreview:
						livePreview === true || typeof livePreview === 'string'
							? (livePreview as boolean | string)
							: false
				};
			})
			.filter((entry) => entry.id.length > 0);
	}

	/** Human label for a collection's preview configuration. */
	function patternLabel(value: boolean | string): string {
		if (value === true) return 'Schema default route';
		if (value === false || value === '') return 'Not configured';
		return value;
	}

	onMount(() => {
		let cancelled = false;

		async function load() {
			const [licenseResult, collectionsResult] = await Promise.allSettled([
				fetchEditableWebsiteLicense(),
				fetch('/api/collections', { credentials: 'include' })
			]);

			if (cancelled) return;

			license = {
				...(licenseResult.status === 'fulfilled'
					? licenseResult.value
					: { active: false, daysRemaining: 0 }),
				loaded: true
			};

			if (collectionsResult.status === 'fulfilled' && collectionsResult.value.ok) {
				try {
					collections = toPreviewCollections(await collectionsResult.value.json());
				} catch (err) {
					logger.debug('[PreviewDashboard] Could not parse /api/collections', err);
					loadError = 'Preview configuration could not be read.';
				}
			} else {
				loadError = 'Preview configuration could not be read.';
			}

			loading = false;
		}

		void load();
		return () => {
			cancelled = true;
		};
	});

	const licenseLabel = $derived.by(() => {
		if (!license.loaded) return 'Checking…';
		if (license.active) return 'Active';
		if (license.daysRemaining && license.daysRemaining > 0) {
			return `Trial — ${license.daysRemaining} day${license.daysRemaining === 1 ? '' : 's'} left`;
		}
		return 'Not licensed';
	});

	const licenseVariant = $derived.by(() => {
		if (!license.loaded) return 'surface' as const;
		if (license.active) return 'success' as const;
		if (license.daysRemaining && license.daysRemaining > 0) return 'warning' as const;
		return 'error' as const;
	});
</script>

<div class="flex flex-col gap-4" data-testid="preview-overview-dashboard">
	<AdminCard class="p-5">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2 class="text-lg font-semibold text-(--admin-text-body)">Live Preview status</h2>
				<p class="mt-1 text-sm text-(--admin-text-muted)">
					Signed tokens, the postMessage bridge and the Svedit edit surface at a glance.
				</p>
			</div>
			<Badge variant={licenseVariant} size="sm" data-testid="preview-license-badge"
				>{licenseLabel}</Badge
			>
		</div>

		<dl class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded-lg border border-surface-500/30 bg-surface-500/10 p-3">
				<dt class="text-xs font-semibold tracking-wider uppercase text-surface-500">License</dt>
				<dd class="mt-1 text-sm text-(--admin-text-body)">
					{licenseLabel}
					{#if !license.active}
						<span class="block text-xs text-surface-500"
							>Upgrade unlocks the preview tab ({EDITABLE_WEBSITE_PRICE}).</span
						>
					{/if}
				</dd>
			</div>
			<div class="rounded-lg border border-surface-500/30 bg-surface-500/10 p-3">
				<dt class="text-xs font-semibold tracking-wider uppercase text-surface-500">Protocol</dt>
				<dd class="mt-1 text-sm text-(--admin-text-body)">
					v{PREVIEW_PROTOCOL_VERSION}
					<span class="block text-xs text-surface-500">Major version is enforced on handshake.</span
					>
				</dd>
			</div>
			<div class="rounded-lg border border-surface-500/30 bg-surface-500/10 p-3">
				<dt class="text-xs font-semibold tracking-wider uppercase text-surface-500">Coverage</dt>
				<dd class="mt-1 text-sm text-(--admin-text-body)">
					{coverage}% of the published matrix
					<span class="block text-xs text-surface-500"
						>{yesCount} of {CAPABILITY_MATRIX.length} capabilities fully shipped.</span
					>
				</dd>
			</div>
			<div class="rounded-lg border border-surface-500/30 bg-surface-500/10 p-3">
				<dt class="text-xs font-semibold tracking-wider uppercase text-surface-500">
					Preview routes
				</dt>
				<dd class="mt-1 text-sm text-(--admin-text-body)">
					{configured.length} of {collections.length} collections
					<span class="block text-xs text-surface-500">Collections with `livePreview` set.</span>
				</dd>
			</div>
		</dl>
	</AdminCard>

	<AdminCard class="p-5">
		<h2 class="text-lg font-semibold text-(--admin-text-body)">Preview configuration</h2>
		<p class="mt-1 text-sm text-(--admin-text-muted)">
			Each collection opts in with `livePreview: true` or a URL pattern such as
			<code class="rounded bg-surface-500/10 px-1 text-xs">/blog/{'{slug}'}?lang={'{lang}'}</code>.
		</p>

		{#if loading}
			<Loader variant="card" height="h-24" ariaLabel="Loading preview configuration" />
		{:else if loadError}
			<p
				class="mt-4 rounded-lg border border-error-500/40 bg-error-500/10 p-3 text-sm text-error-500"
				role="alert"
			>
				{loadError}
			</p>
		{:else if collections.length === 0}
			<p class="mt-4 text-sm text-surface-500">
				No collections yet. Create one to enable live preview.
			</p>
		{:else}
			<ul
				class="mt-4 flex flex-col divide-y divide-surface-500/20"
				aria-label="Collections and their preview routes"
			>
				{#each collections as collection (collection.id)}
					{@const isConfigured = collection.livePreview !== false && collection.livePreview !== ''}
					<li class="flex flex-wrap items-center justify-between gap-2 py-2">
						<span class="text-sm font-medium text-(--admin-text-body)">{collection.name}</span>
						<span class="flex items-center gap-2">
							{#if isConfigured}
								<code
									class="rounded bg-surface-500/10 px-1.5 py-0.5 text-xs text-(--admin-text-muted)"
								>
									{patternLabel(collection.livePreview)}
								</code>
								<Badge variant="success" size="sm">Live</Badge>
							{:else}
								<Badge variant="surface" size="sm">Not configured</Badge>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</AdminCard>

	<AdminCard class="p-5">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 class="text-lg font-semibold text-(--admin-text-body)">Capability status</h2>
			<span class="text-xs text-surface-500">Reviewed {MATRIX_REVIEWED_AT}</span>
		</div>
		<ul class="mt-4 flex flex-col gap-3">
			{#each CAPABILITY_MATRIX as row (row.id)}
				<li
					class="flex flex-wrap items-start justify-between gap-2 border-s-2 border-surface-500/30 ps-3"
				>
					<div class="min-w-0">
						<p class="text-sm font-medium text-(--admin-text-body)">{row.label}</p>
						<p class="mt-0.5 text-xs text-(--admin-text-muted)">{row.detail}</p>
					</div>
					<Badge variant={LEVEL_BADGE_VARIANT[row.svelty]} size="sm"
						>{LEVEL_LABELS[row.svelty]}</Badge
					>
				</li>
			{/each}
		</ul>
		<p class="mt-4 text-xs text-surface-500">{MATRIX_SOURCE_NOTE}</p>
	</AdminCard>

	<AdminCard class="p-5">
		<h2 class="text-lg font-semibold text-(--admin-text-body)">Still open</h2>
		<p class="mt-1 text-sm text-(--admin-text-muted)">
			Listed so the dashboard never overstates parity. Each item ships with a test or leaves this
			list.
		</p>
		<ul class="mt-4 flex flex-col gap-3">
			{#each OPEN_GAPS as gap (gap.id)}
				<li class="rounded-lg border border-surface-500/30 bg-surface-500/10 p-3">
					<p class="text-sm font-medium text-(--admin-text-body)">{gap.label}</p>
					<p class="mt-0.5 text-xs text-(--admin-text-muted)">{gap.detail}</p>
				</li>
			{/each}
		</ul>
	</AdminCard>
</div>
