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
	class="group relative flex h-24 w-full flex-col items-center justify-center gap-2 rounded border border-surface-500/30 bg-white p-2 text-center shadow-sm transition-all duration-300 ease-out
         hover:-translate-y-1 hover:border-tertiary-500 hover:bg-primary-500/10 hover:shadow-xl
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary-500 focus-visible:ring-offset-2
         dark:bg-surface-900 dark:hover:border-primary-500 dark:hover:bg-surface-700
         lg:h-32
         {enabled ? '' : 'pointer-events-none opacity-60 grayscale'}"
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
