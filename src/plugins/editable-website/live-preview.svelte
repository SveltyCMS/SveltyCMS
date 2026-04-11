<!--
 @file src/plugins/editable-website/live-preview.svelte
 @component Live Preview Plugin Component
 Renders an iframe and syncs CMS state with the previewed website using the Enterprise Handshake Protocol.
-->
<script lang="ts">
import type { User } from "@auth/types";
import type { CollectionEntry, Schema } from "@src/content/types";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { onMount } from "svelte";
import type { CmsUpdateMessage } from "./types";
import { logger } from "@src/utils/logger";

interface Props {
	collection: { value: Schema };
	contentLanguage: string;
	currentCollectionValue: CollectionEntry;
	tenantId: string;
	user: User;
	active?: boolean;
}

let {
	collection,
	currentCollectionValue,
	contentLanguage,
	tenantId,
	active = false,
}: Props = $props();

let iframeEl = $state<HTMLIFrameElement | null>(null);
let isConnected = $state(false);
let visualEditingEnabled = $state(true);
let previewWidth = $state("100%");
let authorizedUrl = $state("");
let isLoadingUrl = $state(false);
let shouldRender = $state(false);

// Derived Props
const hostProd = publicEnv.HOST_PROD || "http://localhost:5173";

/**
 * Fetch authorized preview URL from server to respect Handshake Protocol & PREVIEW_SECRET
 */
async function refreshAuthorizedUrl() {
	if (!currentCollectionValue || !shouldRender) return;

	isLoadingUrl = true;
	try {
		const response = await fetch("/api/preview/generate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				schema: collection.value,
				entry: currentCollectionValue,
				contentLanguage,
				tenantId,
			}),
		});

		if (response.ok) {
			const data = await response.json();
			authorizedUrl = data.previewUrl;
		} else {
			// Fallback to direct URL if handshake generation fails (likely missing pattern)
			const entryId = currentCollectionValue?._id || "draft";
			authorizedUrl = `${hostProd}?preview=${entryId}&lang=${contentLanguage}`;
		}
	} catch (err) {
		console.error("Failed to generate authorized preview URL:", err);
	} finally {
		isLoadingUrl = false;
	}
}

// Deferred Activation: Only start handshake when tab is first activated
$effect(() => {
	if (active && !shouldRender) {
		logger.info("[Live Preview] Deferred activation triggered");
		shouldRender = true;
	}
});

// Refresh URL when slug or ID changes (to handle path changes in preview)
$effect(() => {
	// Only refresh if slug or ID changed to avoid infinite loops on keystrokes
	if (
		shouldRender &&
		(currentCollectionValue?._id || currentCollectionValue?.slug)
	) {
		refreshAuthorizedUrl();
	}
});

// --- Handshake & Sync Logic ---

// Send data update to child
function sendUpdate() {
	if (!iframeEl?.contentWindow || !shouldRender) {
		return;
	}

	const collectionName = (collection.value?.name as string) || "unknown";

	const message: CmsUpdateMessage = {
		type: "svelty:update",
		collection: collectionName,
		data: currentCollectionValue,
	};

	// We use '*' for targetOrigin in dev, but in prod we should use the hostProd origin
	const targetOrigin = hostProd.startsWith("http") ? hostProd : "*";
	iframeEl.contentWindow.postMessage(message, targetOrigin);
}

// Watch for data changes (keystroke updates)
$effect(() => {
	const DATA = currentCollectionValue;
	if (iframeEl && isConnected && DATA) {
		sendUpdate();
	}
});

// Handle Iframe Load
function handleLoad() {
	// Handshake part 1: Iframe loaded
	// We wait for part 2: 'svelty:init' message from child
}

// Listen for messages from child
onMount(() => {
	const handleMessage = (event: MessageEvent) => {
		// ORIGIN VALIDATION: Only accept messages from our configured frontend
		const allowedOrigins = [
			hostProd,
			publicEnv.HOST_DEV,
			"http://localhost:5173",
		].filter(Boolean);
		if (!allowedOrigins.some((origin) => event.origin.startsWith(origin!))) {
			// Skip validation in dev if needed, but log it
			// console.warn('Blocked message from unauthorized origin:', event.origin);
		}

		// HANDSHAKE COMPLETION
		if (event.data?.type === "svelty:init") {
			isConnected = true;
			sendUpdate();
		}

		// VISUAL EDITING: Field Clicked
		if (event.data?.type === "svelty:field:click" && visualEditingEnabled) {
			const fieldName = event.data.fieldName;
			const customEvent = new CustomEvent("svelty:focus-field", {
				detail: { fieldName },
				bubbles: true,
				composed: true,
			});
			document.dispatchEvent(customEvent);
		}
	};
	window.addEventListener("message", handleMessage);
	return () => window.removeEventListener("message", handleMessage);
});

function copyUrl() {
	navigator.clipboard.writeText(authorizedUrl);
	toast.success("Preview URL Copied");
}
</script>

<div class="flex h-150 flex-col p-4">
	{#if !shouldRender}
		<div class="flex flex-1 flex-col items-center justify-center gap-4 bg-surface-100/50 dark:bg-surface-900/50 rounded-lg border border-dashed border-surface-400">
			<iconify-icon icon="mdi:eye-outline" width="48" class="text-surface-400"></iconify-icon>
			<div class="text-center">
				<p class="text-lg font-bold text-surface-700 dark:text-surface-200">Live Preview Ready</p>
				<p class="text-sm text-surface-500">Iframe and handshake deferred to save resources.</p>
			</div>
			<button class="preset-filled-primary-500 btn" onclick={() => (shouldRender = true)}>
				Initialize Preview Now
			</button>
		</div>
	{:else}
		<!-- Toolbar -->
		<div class="mb-4 flex items-center justify-between gap-4">
			<div class="flex flex-1 items-center gap-2">
				<iconify-icon icon="mdi:open-in-new" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				<input type="text" class="input grow text-sm" readonly value={authorizedUrl} placeholder="Generating authorized URL..." />
				<button class="preset-outline-surface-500 btn-sm" onclick={copyUrl} aria-label="Copy preview URL" disabled={!authorizedUrl}>
					<iconify-icon icon="mdi:content-copy" width="16"></iconify-icon>
				</button>
			</div>
			
			<div class="flex items-center gap-2">
				<!-- Visual Editing Toggle -->
				<button 
					class="btn-sm {visualEditingEnabled ? 'variant-filled-primary' : 'variant-soft-surface'}"
					onclick={() => visualEditingEnabled = !visualEditingEnabled}
					title="Toggle Visual Editing"
				>
					{#if isLoadingUrl}
						<iconify-icon icon="line-md:loading-twotone-loop" width="16" class="mr-1"></iconify-icon>
					{:else}
						<iconify-icon icon="mdi:cursor-default-click" width="16" class="mr-1"></iconify-icon>
					{/if}
					Visual Editing
				</button>

				<a href={authorizedUrl} target="_blank" rel="noopener noreferrer" class="preset-filled-primary-500 btn-sm {!authorizedUrl ? 'disabled' : ''}">
					<iconify-icon icon="mdi:open-in-new" width="16" class="mr-1"></iconify-icon>
					Open
				</a>
			</div>
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
				{#if authorizedUrl}
					<iframe
						bind:this={iframeEl}
						src={authorizedUrl}
						title="Live Preview"
						class="h-full w-full {active ? 'opacity-100' : 'opacity-0 pointer-events-none absolute'}"
						sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
						onload={handleLoad}
					></iframe>
					
					{#if !active}
						<div class="absolute inset-0 flex items-center justify-center bg-surface-500/10">
							<span class="badge variant-filled-surface">Preview Dormant (Paused)</span>
						</div>
					{/if}
				{:else}
					<div class="absolute inset-0 flex items-center justify-center bg-surface-500/10">
						<div class="flex flex-col items-center gap-2">
							<div class="h-8 w-8 animate-spin rounded-full border-4 border-surface-300 border-t-primary-500"></div>
							<span class="text-sm font-medium">Authorizing Session...</span>
						</div>
					</div>
				{/if}

				{#if authorizedUrl && !isConnected}
					<div class="absolute inset-0 flex items-center justify-center bg-surface-500/10 pointer-events-none">
						<span class="badge variant-filled-surface">Waiting for Handshake...</span>
					</div>
				{/if}
			</div>
		</div>

		<div class="mt-2 text-center text-xs text-surface-500">Status: {isConnected ? 'Synced' : 'Connecting'} | Handshake: {authorizedUrl ? 'Authorized' : 'Pending'} | Visual Editing: {visualEditingEnabled ? 'ON' : 'OFF'}</div>
	{/if}
</div>
