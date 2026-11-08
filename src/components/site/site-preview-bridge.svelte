<!--
@file src/components/site/site-preview-bridge.svelte
@component
**Live preview bridge for the site starter** — connects iframe to CMS postMessage protocol.

### Props
- `entry` (Record): Current page entry data to sync.
- `collection` (string): Collection name (default: pages).
- `enabled` (boolean): Enable bridge (default: true in iframe).
- `onEntryChange` (function): Called when the CMS pushes a live-preview edit back,
  so a caller can hold the entry in its own state instead of a two-way binding.
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import type { SitePage } from '@src/services/site/types';
	import { createSitePreviewBridge, postPreviewSave } from '@utils/site-preview-bridge';

	interface Props {
		entry?: SitePage | Record<string, unknown> | null;
		collection?: string;
		enabled?: boolean;
		onEntryChange?: (entry: SitePage | Record<string, unknown> | null) => void;
	}

	let {
		entry = $bindable<SitePage | Record<string, unknown> | null>(null),
		collection = 'pages',
		enabled = true,
		onEntryChange
	}: Props = $props();

	let bridgeActive = $state(false);

	/** Keep the local entry and notify the owner (binding is optional). */
	function applyEntry(next: SitePage | Record<string, unknown>) {
		entry = next;
		onEntryChange?.(next);
	}

	onMount(() => {
		if (!enabled) return;

		const inFrame = window.parent !== window;
		if (!inFrame && !new URLSearchParams(window.location.search).has('preview_token')) {
			return;
		}

		const bridge = createSitePreviewBridge({
			// The CMS editor frame is same-origin; without this the listener accepts
			// `svelty:update` payloads from any embedding origin, which would inject
			// unsanitized rich text into the preview renderer's HTML sink.
			origin: window.location.origin,
			visualEditing: inFrame,
			onUpdate: (data) => {
				applyEntry({ ...(entry as Record<string, unknown>), ...data });
			},
			onPreviewSave: (data) => {
				const merged = { ...(entry as Record<string, unknown>), ...data };
				applyEntry(merged);
				postPreviewSave(collection, merged);
			}
		});

		bridgeActive = true;

		return () => {
			bridge.destroy();
			bridgeActive = false;
		};
	});
</script>

{#if bridgeActive}
	<div
		class="pointer-events-none fixed bottom-3 inset-e-3 z-50 rounded-full bg-primary-500/90 px-3 py-1 text-xs font-medium text-white shadow-lg"
		role="status"
		aria-live="polite"
	>
		Live preview connected
	</div>
{/if}
