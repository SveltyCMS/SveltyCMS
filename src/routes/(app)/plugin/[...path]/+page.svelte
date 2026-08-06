<!--
@file src/routes/(app)/plugin/[...path]/+page.svelte
@component Plugin-contributed admin page — resolves the lazy component by page id
and renders it inside the admin shell with server props.
-->

<script lang="ts">
	import '@src/plugins/index';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import Loader from '@components/ui/loader.svelte';
	import { pluginPageRegistry } from '@src/plugins/plugin-page-registry.svelte.ts';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	const pageDef = $derived(pluginPageRegistry.getById(data.pageId));
</script>

<AdminPageShell
	title={data.title ?? 'Plugin'}
	icon="mdi:puzzle"
	showBackButton={true}
	backUrl="/config"
>
	{#if pageDef}
		{#await pageDef.component()}
			<Loader variant="card" height="h-40" ariaLabel="Loading plugin page" />
		{:then Component}
			{#if Component.default}
				<Component.default {...data.props} />
			{:else}
				<Component {...data.props} />
			{/if}
		{:catch error}
			<div
				class="rounded border border-error-500/50 bg-error-50 p-4 text-sm text-error-600 dark:bg-error-900/10 dark:text-error-500"
				role="alert"
			>
				<strong>Plugin page failed to load ({pageDef.id}):</strong> {error.message}
			</div>
		{/await}
	{:else}
		<div class="p-8 text-center text-sm text-surface-500" data-testid="plugin-page-missing">
			Plugin page not found.
		</div>
	{/if}
</AdminPageShell>
