<!-- 
 @src/routes/api/cms.ts src/components/ui/portal.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Portal Primitive
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		target?: HTMLElement | string | null;
		children: Snippet;
	}

	let { target = 'body', children }: Props = $props();
	let portalEl = $state<HTMLElement | null>(null);

	onMount(() => {
		const targetEl = typeof target === 'string' ? document.querySelector(target) : target;
		if (!targetEl || !portalEl) return;
		
		targetEl.appendChild(portalEl);
		
		return () => {
			if (portalEl?.parentNode) {
				portalEl.parentNode.removeChild(portalEl);
			}
		};
	});
</script>

<div bind:this={portalEl} class="contents">
	{@render children()}
</div>
