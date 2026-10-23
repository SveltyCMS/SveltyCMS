<!--
@file src/routes/(admin)/+layout.svelte
@component
**(admin) route group layout — positioned full-height frame for AdminPageShell**

`AdminPageShell` is `absolute inset-0` and relies on its layout to provide a
positioned, full-height parent (the `(app)` layout's `<main>`). Without this
file the `(admin)` pages had a 0px-tall shell and rendered blank.

### Props
- `children` (Snippet): Route content.

### Features:
- Same container chain as `(app)/+layout.svelte` (relative h-lvh wrapper, relative `<main>`)
- Theme tokens only; no data loading, auth or chrome changes
-->

<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<div class="relative h-lvh w-full overflow-hidden" style="background-color: var(--admin-bg-page)">
	<main class="relative z-0 flex h-lvh w-full min-w-0 flex-col overflow-x-clip">
		{@render children?.()}
	</main>
</div>
