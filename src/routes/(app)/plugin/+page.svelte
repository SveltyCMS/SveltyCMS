<!--
@file src/routes/(app)/plugin/+page.svelte
@component Plugin pages index — lists plugin-contributed admin pages.
-->

<script lang="ts">
	import '@src/plugins/index';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import { pluginPageRegistry } from '@src/plugins/plugin-page-registry.svelte.ts';

	const navItems = $derived.by(() => {
		void pluginPageRegistry.version;
		return pluginPageRegistry.getNavItems();
	});
</script>

<AdminPageShell title="Plugin Pages" icon="mdi:puzzle" showBackButton={true} backUrl="/config">
	{#if navItems.length > 0}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="plugin-pages-index">
			{#each navItems as item (item.id)}
				<AdminCard class="p-4">
					<a
						href={item.path}
						data-sveltekit-preload-data="hover"
						class="flex items-center gap-3 no-underline!"
						aria-label={item.label}
					>
						<iconify-icon icon={item.icon} width="22" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						<div class="min-w-0">
							<div class="text-sm font-semibold text-surface-900 dark:text-surface-100">{item.label}</div>
							<div class="text-xs text-surface-500">{item.group}</div>
						</div>
					</a>
				</AdminCard>
			{/each}
		</div>
	{:else}
		<div class="p-8 text-center text-sm text-surface-500">
			No plugin pages installed. Plugin-contributed admin pages appear here.
		</div>
	{/if}
</AdminPageShell>
