<!--
  @file src/plugins/unified-data-hub/components/config-tile.svelte
  @component Config grid tile for Unified Data Hub plugin workspace launcher.
-->
<script lang="ts">
	import { pluginWorkspace } from '@stores/plugin-workspace.svelte';
	import { CONFIG_TILE_CLASS } from '@components/ui/config-tile-classes';

	interface Props {
		pluginId?: string;
		enabled?: boolean;
		subtitle?: string;
	}

	let {
		pluginId = 'unified-data-hub',
		enabled = false,
		subtitle = 'Federate Postgres & REST • LocalCMS reads • WebMCP'
	}: Props = $props();

	function openWorkspace() {
		if (!enabled) return;
		pluginWorkspace.open(pluginId);
	}
</script>

<button
	type="button"
	onclick={openWorkspace}
	class="{CONFIG_TILE_CLASS} {enabled ? '' : 'pointer-events-none opacity-60 grayscale'}"
	aria-label="Open Unified Data Hub — connect and govern external data sources"
	aria-disabled={!enabled}
>
	<iconify-icon
		icon="mdi:database-sync"
		class="text-3xl lg:text-4xl text-tertiary-500 transition-transform duration-300 group-hover:scale-110"
	></iconify-icon>
	<div class="flex flex-col items-center gap-0.5">
		<p
			class="w-full truncate text-xs font-medium uppercase tracking-wide text-surface-600 group-hover:text-tertiary-600 dark:text-primary-500 dark:group-hover:text-primary-500 lg:text-sm"
		>
			Unified Hub
		</p>
		{#if subtitle}
			<p class="text-[9px] text-surface-400 dark:text-surface-500 line-clamp-1">{subtitle}</p>
		{/if}
	</div>
</button>
