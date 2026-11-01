<!--
@file src/components/ui/portal.svelte
@component
**SveltyCMS Portal — WCAG 3.0 Ready**

Teleports content to a target DOM node (default: `document.body`). Used by Modal,
Drawer, Popover, and Tooltip to escape overflow/stacking context constraints.

### Props
- `target` (HTMLElement | string | null): Target selector or element (default: 'body').
- `children` (Snippet): Content to teleport.

### Features:
- renders children into specified DOM target via `appendChild`
- cleanup on unmount (removes portal element)
- full Svelte 5 runes: $props, $state, onMount
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
		// `target` is a caller-supplied string, so it may be any CSS — including one
		// that does not parse. An `#id` is resolved by id lookup instead of being
		// parsed as a selector, and an invalid selector becomes "no target" instead
		// of an uncaught SyntaxError during mount.
		let targetEl: ParentNode | null = null;
		if (typeof target === 'string') {
			if (target.startsWith('#')) {
				targetEl = document.getElementById(target.slice(1));
			} else {
				try {
					targetEl = document.querySelector(target);
				} catch {
					targetEl = null;
				}
			}
		} else {
			targetEl = target;
		}
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
