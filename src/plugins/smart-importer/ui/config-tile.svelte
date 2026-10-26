<!--
  @file src/plugins/smart-importer/ui/config-tile.svelte
  @component
  **Config grid tile for Smart AI-Driven Migration Pro.**
  Opens the plugin workspace slot — no dedicated route.
  @props pluginId, isPro, enabled, subtitle

  ### Features:
  - Slot-driven launcher (plugin_workspace overlay)
  - Localized title, subtitle, accessible name, and Free/Pro badge
  - Free/Pro badge pinned to the inline-end top corner (RTL-aware)
  - Keyboard-accessible with focus-visible ring
-->
<script lang="ts">
	import { pluginWorkspace } from '@stores/plugin-workspace.svelte';
	import { CONFIG_TILE_CLASS } from '@components/ui/config-tile-classes';
	import {
		plugin_badge_free,
		plugin_badge_pro,
		plugin_migration_open_aria,
		plugin_migration_subtitle,
		plugin_migration_title
	} from '@src/paraglide/messages';

	interface Props {
		pluginId?: string;
		isPro?: boolean;
		enabled?: boolean;
		subtitle?: string;
	}

	let { pluginId = 'smart-importer', isPro = false, enabled = true, subtitle }: Props = $props();

	// Fall back to the translated default when no subtitle prop is supplied.
	const subtitleText = $derived(subtitle ?? plugin_migration_subtitle());

	function openWorkspace() {
		if (!enabled) return;
		pluginWorkspace.open(pluginId);
	}
</script>

<button
	type="button"
	onclick={openWorkspace}
	class="{CONFIG_TILE_CLASS} {enabled ? '' : 'pointer-events-none opacity-60 grayscale'}"
	aria-label={plugin_migration_open_aria()}
	aria-disabled={!enabled}
>
	{#if isPro}
		<span
			class="absolute top-1.5 inset-e-1.5 z-10 rounded-full border border-warning-500/30 bg-warning-500/10 px-2 py-0.5 text-xs font-bold tracking-wider text-warning-500 shadow-sm"
		>
			{plugin_badge_pro()}
		</span>
	{:else}
		<span
			class="absolute top-1.5 inset-e-1.5 z-10 rounded-full bg-surface-500/10 px-2 py-0.5 text-xs font-medium text-surface-500 shadow-sm dark:bg-surface-700 dark:text-white"
		>
			{plugin_badge_free()}
		</span>
	{/if}

	<iconify-icon
		icon="mdi:database-import-outline"
		class="text-3xl lg:text-4xl text-tertiary-500 transition-transform duration-300 group-hover:scale-110"
	></iconify-icon>

	<div class="flex flex-col items-center gap-1">
		<p
			class="w-full truncate text-sm font-medium uppercase tracking-wide text-surface-600 group-hover:text-tertiary-600 dark:text-primary-500 dark:group-hover:text-tertiary-500 lg:text-base"
		>
			{plugin_migration_title()}
		</p>

		{#if subtitleText}
			<p class="text-xs text-surface-400 line-clamp-1 lg:line-clamp-2">
				{subtitleText}
			</p>
		{/if}
	</div>
</button>
