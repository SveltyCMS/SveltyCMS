<!--
 @file src/plugins/editable-website/live-preview.svelte
 @component Live Preview with bidirectional handshake and visual editing.
 Securely syncs CMS state with an external website preview using Svelte 5 runes.

 Uses collection schema livePreview / previewTargetUrl for dynamic origin resolution.
 Signs ephemeral preview tokens via /api/preview/authorize.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Loader from '@components/ui/loader.svelte';
	import UpgradePrompt from '@components/ui/upgrade-prompt.svelte';
  import Badge from "@components/ui/badge.svelte";
  import type { User } from "@auth/types";
  import type { CollectionEntry, Schema } from "@src/content/types";
  import { publicEnv } from "@src/stores/global-settings.svelte";
  import { toast } from "@src/stores/toast.svelte.ts";
  import { logger } from "@src/utils/logger";
  import { fade } from "svelte/transition";

  import {
    EDITABLE_WEBSITE_EXTENSION_ID,
    EDITABLE_WEBSITE_PRICE,
    fetchEditableWebsiteLicense,
    type EditableWebsiteLicenseView,
  } from "./license-gate";
  import {
    dispatchPreviewUpdate,
    isCmsInboundMessage,
    mergePreviewEdits,
    PREVIEW_PROTOCOL_VERSION,
  } from "./protocol";
  import type { CmsEditModeMessage, CmsUpdateMessage } from "./types";

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
  let pendingPreviewEdits = $state(0);
  let lastSyncSource = $state<"visual" | "form" | null>(null);
  let licenseStatus = $state<EditableWebsiteLicenseView & { loaded: boolean }>({
    active: false,
    daysRemaining: null,
    loaded: false,
  });

  const licenseActive = $derived(licenseStatus.loaded && licenseStatus.active);

  $effect(() => {
    let cancelled = false;
    fetchEditableWebsiteLicense().then((status) => {
      if (!cancelled) {
        licenseStatus = { ...status, loaded: true };
      }
    });
    return () => {
      cancelled = true;
    };
  });

  const livePreviewPattern = $derived.by(() => {
    const schema = collection.value as Schema & { previewTargetUrl?: string };
    if (schema.previewTargetUrl) return schema.previewTargetUrl;
    if (typeof schema.livePreview === "string") return schema.livePreview;
    if (schema.livePreview === true) return "/{slug}?lang={lang}";
    return publicEnv.HOST_PROD || "http://localhost:5173";
  });

  const previewTargetUrl = $derived(livePreviewPattern);

  const allowedOrigins = $derived(
    [previewTargetUrl, publicEnv.HOST_PROD, publicEnv.HOST_DEV, "http://localhost:5173"]
      .filter(Boolean)
      .map((url) => {
        try {
          const normalized = url!.startsWith("http") ? url! : `http://localhost:5173${url}`;
          return new URL(normalized).origin;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[],
  );

  async function refreshAuthorizedUrl() {
    if (!shouldRender || !currentCollectionValue || !licenseActive) return;

    isLoadingUrl = true;
    try {
      const res = await fetch("/api/preview/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: collection.value,
          entry: currentCollectionValue,
          contentLanguage,
          tenantId,
          previewTargetUrl: livePreviewPattern,
        }),
      });

      if (res.ok) {
        const { previewUrl } = await res.json();
        authorizedUrl = previewUrl;
      } else if (res.status === 403) {
        licenseStatus = { active: false, daysRemaining: 0, loaded: true };
        authorizedUrl = "";
        toast.error("Live Preview requires an active Editable Website license or trial");
      } else {
        logger.error("Preview authorize failed", { status: res.status });
        authorizedUrl = "";
      }
    } catch (err) {
      logger.error("Failed to generate secure preview URL", { error: err });
      authorizedUrl = "";
    } finally {
      isLoadingUrl = false;
    }
  }

  $effect(() => {
    if (active && !shouldRender) {
      shouldRender = true;
    }
  });

  $effect(() => {
    if (
      shouldRender &&
      (currentCollectionValue?._id || currentCollectionValue?.slug)
    ) {
      refreshAuthorizedUrl();
    }
  });

  function sendUpdate() {
    if (!iframeEl?.contentWindow || !isConnected || !authorizedUrl) return;

    const message: CmsUpdateMessage = {
      type: "svelty:update",
      collection: collection.value?.name || collection.value?._id || "unknown",
      data: currentCollectionValue as Record<string, unknown>,
    };

    let targetOrigin = "*";
    try {
      const url = authorizedUrl.startsWith("http")
        ? authorizedUrl
        : `${publicEnv.HOST_DEV || "http://localhost:5173"}${authorizedUrl}`;
      targetOrigin = new URL(url).origin;
    } catch {
      targetOrigin = "*";
    }

    iframeEl.contentWindow.postMessage(message, targetOrigin);

    const editModeMsg: CmsEditModeMessage = {
      type: "svelty:edit-mode",
      enabled: visualEditingEnabled,
    };
    iframeEl.contentWindow.postMessage(editModeMsg, targetOrigin);
  }

  $effect(() => {
    if (isConnected && shouldRender && currentCollectionValue) {
      lastSyncSource = "form";
      sendUpdate();
    }
  });

  function applyPreviewEdits(msg: Parameters<typeof mergePreviewEdits>[1]) {
    const merged = mergePreviewEdits(
      currentCollectionValue as Record<string, unknown>,
      msg,
    );
    pendingPreviewEdits++;
    lastSyncSource = "visual";
    dispatchPreviewUpdate({
      data: merged,
      fieldName: msg.type === "svelty:document:update" ? msg.fieldName : undefined,
      source: "visual",
    });
    toast.info("Preview changes synced to editor — save to persist");
  }

  function handleMessage(event: MessageEvent) {
    if (!allowedOrigins.includes(event.origin)) return;
    if (!isCmsInboundMessage(event.data)) return;

    const data = event.data;

    if (data.type === "svelty:init") {
      isConnected = true;
      sendUpdate();
      logger.info("[Live Preview] Handshake completed", {
        version: data.version || "unknown",
      });
    }

    if (data.type === "svelty:field:click" && visualEditingEnabled) {
      document.dispatchEvent(
        new CustomEvent("svelty:focus-field", {
          detail: { fieldName: data.fieldName },
          bubbles: true,
          composed: true,
        }),
      );
    }

    if (data.type === "svelty:save" || data.type === "svelty:document:update") {
      applyPreviewEdits(data);
    }
  }

  $effect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  });

  $effect(() => {
    if (isConnected) {
      sendUpdate();
    }
  });

  function copyUrl() {
    if (authorizedUrl) {
      navigator.clipboard.writeText(authorizedUrl);
      toast.success("Preview URL copied to clipboard");
    }
  }

  function pushToPreview() {
    sendUpdate();
    toast.success("Changes pushed to preview");
  }
</script>

<div class="flex h-150 flex-col p-4">
  {#if !licenseStatus.loaded}
    <div class="flex flex-1 flex-col items-center justify-center gap-3">
      <Loader variant="circle" width="size-10" height="size-10" ariaLabel="Checking license" />
      <p class="text-sm text-surface-500">Checking Live Preview license…</p>
    </div>
  {:else if !licenseActive}
    <UpgradePrompt
      extensionId={EDITABLE_WEBSITE_EXTENSION_ID}
      price={`${EDITABLE_WEBSITE_PRICE} · 14-day trial`}
      title="Unlock visual frontpage editing"
      message="Your SvelteKit site and Svedit layout are included free. The Editable Website plugin adds Live Preview — edit hero, text, and CTA blocks inline from the CMS. Standard form editing works without a license."
      class="flex-1"
    />
  {:else if !shouldRender}
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
          Bidirectional sync · protocol v{PREVIEW_PROTOCOL_VERSION}
        </p>
        {#if licenseStatus.daysRemaining && licenseStatus.daysRemaining > 0 && !licenseStatus.hasLicense}
          <Badge variant="tertiary" size="sm">
            Trial · {licenseStatus.daysRemaining} day{licenseStatus.daysRemaining === 1 ? "" : "s"} left
          </Badge>
        {/if}
      </div>
      <Button variant="primary" onclick={() => (shouldRender = true)}>
        Start Preview
      </Button>
    </div>
  {:else}
    <div class="mb-4 flex items-center justify-between gap-3">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <iconify-icon icon="mdi:open-in-new" width="20" class="text-tertiary-500 dark:text-primary-500"
        ></iconify-icon>
        <input aria-label="Preview URL" type="text" class="input grow truncate font-mono text-sm" readonly value={authorizedUrl} placeholder={isLoadingUrl ? "Authorizing..." : "URL not available"} />
        <Button
          variant="outline"
          onclick={copyUrl}
          disabled={!authorizedUrl}
          title="Copy Preview URL"
          aria-label="Copy preview URL"
          size="sm"
          class="preset-outline-surface"
        >
          <iconify-icon icon="mdi:content-copy" width={16}></iconify-icon>
        </Button>
      </div>

      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onclick={pushToPreview}
          disabled={!isConnected}
          title="Push CMS changes to preview"
          aria-label="Push to preview"
        >
          <iconify-icon icon="mdi:sync" width={16}></iconify-icon>
          <span class="hidden sm:inline">Push</span>
        </Button>

        <Button
          variant="primary"
          onclick={() => (visualEditingEnabled = !visualEditingEnabled)}
          title="Toggle Click-to-Edit"
          aria-label="Toggle Click-to-Edit"
          size="sm"
          class={visualEditingEnabled ? "" : "preset-soft-surface"}
        >
          <iconify-icon icon="mdi:cursor-default-click" width={16}></iconify-icon>
          <span class="hidden sm:inline">Visual Edit</span>
        </Button>

        <Button
          variant="primary"
          size="sm"
          href={authorizedUrl}
          target="_blank"
          rel="noopener noreferrer"
          disabled={!authorizedUrl}
        >
          <iconify-icon icon="mdi:open-in-new" width={16}></iconify-icon>
          <span class="hidden sm:inline">Open</span>
        </Button>
      </div>
    </div>

    <div class="mb-3 flex justify-center gap-1">
      {#each [{ label: "Desktop", width: "100%", icon: "mdi:monitor" }, { label: "Tablet", width: "768px", icon: "mdi:tablet" }, { label: "Mobile", width: "375px", icon: "mdi:cellphone" }] as device (device.label)}
        <Button
          variant="primary"
          onclick={() => (previewWidth = device.width)}
          title={device.label}
          aria-label={device.label}
          size="sm"
          class="min-w-0 p-0!"
        >
          <iconify-icon icon={device.icon} width={20}></iconify-icon>
        </Button>
      {/each}
    </div>

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
            <p class="text-sm text-surface-500">Generating secure preview session...</p>
          </div>
        {/if}
      </div>
    </div>

    <div
      class="mt-2 flex items-center justify-center gap-2 text-center text-[10px] uppercase tracking-wider text-surface-500"
    >
      <span>
        Status:
        <span class={isConnected ? "text-green-500" : "text-amber-500"}>
          {isConnected ? "Synced" : "Handshaking"}
        </span>
      </span>
      <span>·</span>
      <span>Visual Edit: {visualEditingEnabled ? "On" : "Off"}</span>
      {#if pendingPreviewEdits > 0}
        <Badge variant="warning" size="sm">{pendingPreviewEdits} from preview</Badge>
      {/if}
      {#if lastSyncSource}
        <span>· Last: {lastSyncSource}</span>
      {/if}
    </div>
  {/if}
</div>