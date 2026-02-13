<!--
 @file src/plugins/editable-website/LivePreview.svelte
 @component Live Preview Plugin Component
 @description Renders an iframe and syncs CMS state with the previewed website using postMessage.
-->
<script lang="ts">
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import type { Schema, CollectionEntry } from '@src/content/types';
	import type { User } from '@auth/types';
	import { toaster } from '@stores/store.svelte';
	import { onMount } from 'svelte';
	import type { CmsUpdateMessage } from './types';

	interface Props {
		collection: { value: Schema };
		currentCollectionValue: CollectionEntry;
		user: User;
		tenantId: string;
		contentLanguage: string;
	}

	let { collection, currentCollectionValue, contentLanguage }: Props = $props();

	let iframeEl = $state<HTMLIFrameElement | null>(null);
	let isConnected = $state(false);
	let previewWidth = $state('100%');

	// Derived Props
	const hostProd = publicEnv.HOST_PROD || 'http://localhost:5173';
	const entryId = $derived(currentCollectionValue?._id || 'draft');
	const previewUrl = $derived(`${hostProd}?preview=${entryId}&lang=${contentLanguage}`);

	// --- Handshake & Sync Logic ---

	// Send data update to child
	function sendUpdate() {
		if (!iframeEl?.contentWindow) return;

		// Derived name from schema or fallback
		const collectionName = (collection.value?.name as string) || 'unknown';

		const message: CmsUpdateMessage = {
			type: 'svelty:update',
			collection: collectionName,
			data: currentCollectionValue
		};

		// Use hostProd as targetOrigin if available for security, else '*' (dev mode fallback)
		// Note: hostProd might be the frontend URL.
		const targetOrigin = hostProd.startsWith('http') ? hostProd : '*';
		iframeEl.contentWindow.postMessage(message, targetOrigin);
	}

	// Watch for data changes
	$effect(() => {
		// Proper dependency tracking by accessing the value
		const _data = currentCollectionValue;
		if (iframeEl && isConnected && _data) {
			sendUpdate();
		}
	});

	// Handle Iframe Load
	function handleLoad() {
		isConnected = true;
		sendUpdate();
	}

	// Listen for handshake from child
	onMount(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.data?.type === 'svelty:init') {
				isConnected = true;
				sendUpdate();
			}
		};
		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	});

	function copyUrl() {
		navigator.clipboard.writeText(previewUrl);
		toaster.success({ description: 'Preview URL Copied' });
	}
</script>

<div class="flex h-[600px] flex-col p-4">
	<!-- Toolbar -->
	<div class="mb-4 flex items-center justify-between gap-4">
		<div class="flex flex-1 items-center gap-2">
			<iconify-icon icon="mdi:open-in-new" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
			<input type="text" class="input grow text-sm" readonly value={previewUrl} />
			<button class="preset-outline-surface-500 btn-sm" onclick={copyUrl} aria-label="Copy preview URL">
				<iconify-icon icon="mdi:content-copy" width="16"></iconify-icon>
			</button>
		</div>
		<a href={previewUrl} target="_blank" rel="noopener noreferrer" class="preset-filled-primary-500 btn-sm">
			<iconify-icon icon="mdi:open-in-new" width="16" class="mr-1"></iconify-icon>
			Open
		</a>
	</div>

	<!-- Device Toggles -->
	<div class="mb-2 flex justify-center gap-2">
		<button
			class="btn-icon btn-sm variant-soft-secondary {previewWidth === '100%' ? 'variant-filled-primary' : ''}"
			onclick={() => (previewWidth = '100%')}
			title="Desktop"
		>
			<iconify-icon icon="mdi:monitor" width="20"></iconify-icon>
		</button>
		<button
			class="btn-icon btn-sm variant-soft-secondary {previewWidth === '768px' ? 'variant-filled-primary' : ''}"
			onclick={() => (previewWidth = '768px')}
			title="Tablet"
		>
			<iconify-icon icon="mdi:tablet" width="20"></iconify-icon>
		</button>
		<button
			class="btn-icon btn-sm variant-soft-secondary {previewWidth === '375px' ? 'variant-filled-primary' : ''}"
			onclick={() => (previewWidth = '375px')}
			title="Mobile"
		>
			<iconify-icon icon="mdi:cellphone" width="20"></iconify-icon>
		</button>
	</div>

	<!-- Preview Window -->
	<div
		class="flex-1 overflow-auto rounded-lg border border-surface-300 relative dark:text-surface-50 flex justify-center bg-surface-100 dark:bg-surface-900"
	>
		<div class="h-full transition-all duration-300 ease-in-out relative bg-white" style="width: {previewWidth}">
			<iframe
				bind:this={iframeEl}
				src={previewUrl}
				title="Live Preview"
				class="h-full w-full"
				sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
				onload={handleLoad}
			></iframe>

			{#if !isConnected}
				<div class="absolute inset-0 flex items-center justify-center bg-surface-500/10 pointer-events-none">
					<span class="badge variant-filled-surface">Connecting...</span>
				</div>
			{/if}
		</div>
	</div>

	<div class="mt-2 text-center text-xs text-surface-500">Status: {isConnected ? 'Synced' : 'Connecting'} | Preview URL: {previewUrl}</div>
</div>
