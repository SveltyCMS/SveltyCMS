<!--
@file src/routes/(site)/+layout.svelte
@component Root layout for the optional in-repo SvelteKit site starter.
-->

<script lang="ts">
	import SiteFooter from '@components/site/site-footer.svelte';
	import SiteHeader from '@components/site/site-header.svelte';
  import { setThemeContext } from "@components/ui/theme-context.svelte";

  let { children, data } = $props();

  setThemeContext({
    id: "site-starter",
    name: "Site Starter",
    variant: "elevated",
    density: "cozy",
    themeName: "default",
    role: "editor",
  });
</script>

{#if data.siteStarterEnabled}
  <div class="flex min-h-screen flex-col bg-surface-50 text-surface-900 dark:bg-surface-950 dark:text-surface-50">
    <SiteHeader siteName={data.siteName ?? "Site"} />
    <main class="flex-1">
      {@render children()}
    </main>
    <SiteFooter siteName={data.siteName ?? "Site"} />
  </div>
{:else}
  {@render children()}
{/if}