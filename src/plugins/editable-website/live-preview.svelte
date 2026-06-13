<!--
 @file src/plugins/editable-website/live-preview.svelte
 @component Live Preview with bidirectional handshake and visual editing.
 Securely syncs CMS state with an external website preview using Svelte 5 runes.
-->

<script lang="ts">
  import type { User } from "@auth/types";
  import type { CollectionEntry, Schema } from "@src/content/types";
  import { publicEnv } from "@src/stores/global-settings.svelte";
  import { toast } from "@src/stores/toast.svelte.ts";
  import { logger } from "@src/utils/logger";
  import { fade } from "svelte/transition";

  import type { CmsUpdateMessage } from "./types";

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
    contentLanguage,
    currentCollectionValue,
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

  const hostProd = publicEnv.HOST_PROD || "http://localhost:5173";

  // Strictly derive allowed origins for message validation
  const allowedOrigins = $derived(
    [hostProd, publicEnv.HOST_DEV, "http://localhost:5173"]
      .filter(Boolean)
      .map((url) => {
        try {
          return new URL(url!).origin;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[],
  );

  /**
   * Securely generates a preview URL using the CMS handshake protocol
   */
  async function refreshAuthorizedUrl() {
    if (!shouldRender || !currentCollectionValue) return;

    isLoadingUrl = true;
    try {
      const res = await fetch("/api/preview/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: collection.value,
          entry: currentCollectionValue,
          contentLanguage,
          tenantId,
        }),
      });

      if (res.ok) {
        const { previewUrl } = await res.json();
        authorizedUrl = previewUrl;
      } else {
        // Fallback if the authorized endpoint is not yet configured
        const entryId =
          currentCollectionValue._id || currentCollectionValue.slug || "draft";
        authorizedUrl = `${hostProd}?preview=${entryId}&lang=${contentLanguage}`;
      }
    } catch (err) {
      logger.error("Failed to generate secure preview URL", { error: err });
      authorizedUrl = `${hostProd}?preview=draft&lang=${contentLanguage}`;
    } finally {
      isLoadingUrl = false;
    }
  }

  // Deferred activation: wait until tab is active to start handshake
  $effect(() => {
    if (active && !shouldRender) {
      shouldRender = true;
    }
  });

  // Refresh URL when the entry path might have changed (slug/ID)
  $effect(() => {
    if (
      shouldRender &&
      (currentCollectionValue?._id || currentCollectionValue?.slug)
    ) {
      refreshAuthorizedUrl();
    }
  });

  /**
   * Syncs the current CMS data state to the preview iframe
   */
  function sendUpdate() {
    if (!iframeEl?.contentWindow || !isConnected || !authorizedUrl) return;

    const message: CmsUpdateMessage = {
      type: "svelty:update",
      collection: collection.value?.name || "unknown",
      data: currentCollectionValue,
    };

    // Strictly target the production origin if possible
    const targetOrigin = hostProd.startsWith("http")
      ? new URL(hostProd).origin
      : "*";
    iframeEl.contentWindow.postMessage(message, targetOrigin);
  }

  // Automatic sync on data changes (debounced by Svelte's microtask batching)
  $effect(() => {
    if (isConnected && shouldRender && currentCollectionValue) {
      sendUpdate();
    }
  });

  /**
   * Message listener for the bidirectional handshake and visual editing
   */
  function handleMessage(event: MessageEvent) {
    // Security: Strict Origin Check
    if (!allowedOrigins.includes(event.origin)) {
      // Silently ignore or log unauthorized cross-window communication
      return;
    }

    const data = event.data;

    if (data?.type === "svelty:init") {
      isConnected = true;
      sendUpdate();
      logger.info("[Live Preview] Handshake completed");
    }

    // Click-to-Edit: Focus the field in the CMS when clicked in preview
    if (data?.type === "svelty:field:click" && visualEditingEnabled) {
      document.dispatchEvent(
        new CustomEvent("svelty:focus-field", {
          detail: { fieldName: data.fieldName },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  $effect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  });

  function copyUrl() {
    if (authorizedUrl) {
      navigator.clipboard.writeText(authorizedUrl);
      toast.success("Preview URL copied to clipboard");
    }
  }
</script>

<div class="flex `h-150 flex-col p-4">
  {#if !shouldRender}
    <!-- Deferred Load State -->
    <div
      class="flex flex-1 flex-col items-center justify-center gap-4 rounded border border-dashed border-surface-400 bg-surface-100/50 dark:bg-surface-900/50"
    >
      <iconify-icon icon="mdi:eye-outline" width="48" class="text-surface-400"
      ></iconify-icon>
      <div class="text-center">
        <p class="text-lg font-bold text-surface-700 dark:text-surface-200">
          Live Preview Ready
        </p>
        <p class="text-sm text-surface-500">
          Initialize handshake to start real-time syncing.
        </p>
      </div>
      <button
        class="btn preset-filled-primary"
        onclick={() => (shouldRender = true)}
       >
        Start Preview
      </button>
    </div>
  {:else}
    <!-- Toolbar -->
    <div class="mb-4 flex items-center justify-between gap-3">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <iconify-icon icon="mdi:open-in-new" width="20" class="text-tertiary-500 dark:text-primary-500"
        ></iconify-icon>
        <input
            type="text"
            class="input grow truncate text-sm font-mono"
            readonly
            value={authorizedUrl}
            placeholder={isLoadingUrl ? "Authorizing..." : "URL not available"}
            aria-label="Preview URL"
          />
        <button
          onclick={copyUrl}
          class="btn btn-sm preset-outline-surface"
          disabled={!authorizedUrl}
          title="Copy Preview URL"
         aria-label="Copy preview URL">
          <iconify-icon icon="mdi:content-copy" width={16}></iconify-icon>
        </button>
      </div>

      <div class="flex items-center gap-2">
        <button
            onclick={() => (visualEditingEnabled = !visualEditingEnabled)}
            class="btn btn-sm {visualEditingEnabled
              ? 'preset-filled-primary'
              : 'preset-soft-surface'}"
            title="Toggle Click-to-Edit"
            aria-label="Toggle Click-to-Edit"
          >
          <iconify-icon icon="mdi:cursor-default-click" width={16}
          ></iconify-icon>
          <span class="hidden sm:inline">Visual Edit</span>
        </button>

        <a
          href={authorizedUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-sm preset-filled-primary {!authorizedUrl
            ? 'disabled pointer-events-none opacity-50'
            : ''}"
        >
          <iconify-icon icon="mdi:open-in-new" width={16}></iconify-icon>
          <span class="hidden sm:inline">Open</span>
        </a>
      </div>
    </div>

    <!-- Device Simulation Controls -->
    <div class="mb-3 flex justify-center gap-1">
      {#each [{ label: "Desktop", width: "100%", icon: "mdi:monitor" }, { label: "Tablet", width: "768px", icon: "mdi:tablet" }, { label: "Mobile", width: "375px", icon: "mdi:cellphone" }] as device}
        <button
          onclick={() => (previewWidth = device.width)}
          class="btn btn-sm btn-icon {previewWidth === device.width
            ? 'variant-filled-primary'
            : 'variant-soft-secondary'}"
          title={device.label}
          aria-label={device.label}
        >
          <iconify-icon icon={device.icon} width={20}></iconify-icon>
        </button>
      {/each}
    </div>

    <!-- Preview Iframe Container -->
    <div
      class="relative flex-1 overflow-hidden rounded border border-surface-300 bg-surface-100 dark:bg-surface-900"
    >
      <div
        class="h-full w-full bg-white transition-all duration-300"
        style="width: {previewWidth}; margin: 0 auto;"
      >
        {#if authorizedUrl}
          <iframe
            bind:this={iframeEl}
            src={authorizedUrl}
            title="Live Preview Content"
            class="h-full w-full transition-opacity duration-500"
            style:opacity={active ? 1 : 0.3}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
          ></iframe>

          {#if !isConnected}
            <div
              transition:fade
              class="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]"
            >
              <div class="text-center text-white">
                <div
                  class="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white"
                ></div>
                <p class="font-medium">Connecting Handshake...</p>
              </div>
            </div>
          {/if}
        {:else}
          <div class="flex h-full flex-col items-center justify-center gap-3">
            <div
              class="h-8 w-8 animate-spin rounded-full border-4 border-surface-300 border-t-primary-500"
            ></div>
            <p class="text-sm text-surface-500">
              Generating secure preview session...
            </p>
          </div>
        {/if}
      </div>
    </div>

    <div
      class="mt-2 text-center text-[10px] uppercase tracking-wider text-surface-500"
    >
      Status: <span class={isConnected ? "text-green-500" : "text-amber-500"}
        >{isConnected ? "Synced" : "Handshaking"}</span
      >
      • Visual Edit: {visualEditingEnabled ? "Active" : "Disabled"}
    </div>
  {/if}
</div>
