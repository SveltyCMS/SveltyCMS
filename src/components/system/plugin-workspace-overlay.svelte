<!--
 @file src/components/system/plugin-workspace-overlay.svelte
 @component Host for the active `plugin_workspace` slot.

 Plugin workspaces (Smart Importer, Unified Data Hub) render **inside the admin
 content column**, not over the whole viewport: the left/right sidebars and the
 shell stay available, exactly like every other admin surface (Media Gallery,
 Collection Builder). The overlay is absolutely positioned against `<main>`
 (`relative`) so it covers only the page content.
-->

<script lang="ts">
	import '@src/plugins/index';
	import Slot from '@components/system/slot.svelte';
	import { pluginWorkspace } from '@stores/plugin-workspace.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	onMount(() => {
		pluginWorkspace.syncFromUrl();
	});

	/**
	 * Keep the store in step with SvelteKit navigation. `?plugin=` is the source of
	 * truth for this surface, but `pluginWorkspace.open()` writes history directly,
	 * so neither side can be trusted alone:
	 * - the workspace's back button (`goto('/config')`) must close the overlay, and
	 * - opening from a config tile must keep it open even though `page.url` lags.
	 */
	const urlPluginId = $derived(page.url.searchParams.get('plugin'));
	$effect(() => {
		if (urlPluginId !== pluginWorkspace.activePluginId) pluginWorkspace.syncFromUrl();
	});
</script>

{#if pluginWorkspace.activePluginId}
	<div
		class="absolute inset-0 z-30 flex flex-col overflow-hidden bg-(--admin-bg-card)"
		role="region"
		aria-label="Plugin workspace"
		data-testid="plugin-workspace"
	>
		<Slot name="plugin_workspace" props={{ activePluginId: pluginWorkspace.activePluginId }} />
	</div>
{/if}
