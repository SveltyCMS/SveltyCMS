<!--
@file src/components/system/admin-zone.svelte
@component
**AdminZone renderer** — renders plugin admin-chrome contributions (AdminTool
parts + AdminAreaExtension) into a named shell zone.

Zones:
- sidebar, toolbar, dashboard, config      (AdminTool parts)
- sidebar, header, footer, content-header, content-footer (AdminAreaExtension)

Components are lazy-loaded, ordered by `order`, and gated behind optional
conditions. The `context` prop mirrors `AdminAreaContext` (user, tenantId,
pathname, collection, isAdmin).

### Usage
<AdminZone zone="header" context={{ pathname: $page.url.pathname }} />
-->

<script lang="ts">
	import '@src/plugins/index';
	import { adminZoneRegistry, type AdminZoneName } from '@src/plugins/admin-zone-registry.svelte.ts';
	import { memoizeLazyLoader, type LazyComponent } from '@utils/lazy-component-loader';

	interface Props {
		zone: AdminZoneName;
		/** Runtime context forwarded to condition predicates + components. */
		context?: Record<string, unknown>;
		/** When true, omit wrapper blocks so entries participate in parent grid/flex. */
		inline?: boolean;
	}

	const { zone, context = {}, inline = false }: Props = $props();

	// Memoized per-entry loaders: entry.component() must NOT be called inline
	// inside {#await} — it returns a new promise per call, which remounts the
	// component on every parent re-render (effect_update_depth_exceeded).
	const entryLoaders = new Map<string, () => Promise<LazyComponent>>();
	function componentLoader(entry: { id: string; component: () => Promise<LazyComponent> }): Promise<LazyComponent> {
		let loader = entryLoaders.get(entry.id);
		if (!loader) {
			loader = memoizeLazyLoader(entry.component);
			entryLoaders.set(entry.id, loader);
		}
		return loader();
	}

	// Read `version` so late registrations (plugin index in lazy route nodes,
	// HMR) re-run this derived — otherwise zones registered after first render
	// never appear (same pattern as slot.svelte).
	const entries = $derived.by(() => {
		void adminZoneRegistry.version;
		return adminZoneRegistry
			.getForZone(zone)
			.filter((entry) => !entry.condition || entry.condition(context));
	});
</script>

<div class={inline ? 'contents' : 'admin-zone'} data-zone={zone}>
	{#each entries as entry (entry.id)}
		<div class={inline ? 'contents' : 'admin-zone-item'}>
		{#await componentLoader(entry)}
				<div class="h-16 w-full animate-pulse rounded bg-surface-100 dark:bg-surface-800"></div>
			{:then Component}
				{#if "default" in Component}
					<Component.default {...entry.props} {...context} />
				{:else}
					<Component {...entry.props} {...context} />
				{/if}
			{:catch error}
				<div class="rounded border border-error-500/50 bg-error-50 p-2 text-xs text-error-600 dark:bg-error-900/10 dark:text-error-500">
					<strong>Zone Error ({entry.id}):</strong> {error.message}
				</div>
			{/await}
		</div>
	{/each}
</div>
