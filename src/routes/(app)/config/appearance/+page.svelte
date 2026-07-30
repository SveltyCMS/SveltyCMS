<!--
@file src/routes/(app)/config/appearance/+page.svelte
@component
**Deprecated route shell — server redirects to Design System**

Canonical: `/config/design-system` (Appearance, Live Preview, themes, overrides).
-->

<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { onMount } from "svelte";

	onMount(() => {
		const tab = page.url.searchParams.get("tab");
		const qs = tab ? `?tab=${encodeURIComponent(tab)}` : "";
		void goto(`/config/design-system${qs}`, { replaceState: true });
	});
</script>

<p class="p-6 text-sm text-surface-500">Redirecting to Design System…</p>
