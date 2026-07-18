<!--
 @file src/services/ai-client/components/ai-status-badge.svelte
 @component Status indicator showing AI inference backend availability.

 Displays a badge in the admin shell footer or media editor that shows
 whether the LiteRT.js WASM runtime is loaded and which accelerator is active.
 
 ### Security
 This component only reads capability flags — it never triggers inference.
 The Worker is created lazily on first `ai.generate*()` call, not at mount.

 ### Features:
 - shows WebGPU / CPU / unavailable status
 - tooltip with detailed capability info
 - keyboard-accessible (Enter/Space to expand)
-->

<script lang="ts">
  import { ai } from "@src/services/ai-client";
  import type { AiCapabilities } from "@src/services/ai-client/types";

  interface Props {
    /** Load capabilities on mount (otherwise shows "idle"). */
    autoDetect?: boolean;
  }

  let {
    autoDetect = true,
  }: Props = $props();

  let capabilities = $state<AiCapabilities | null>(null);
  let isLoading = $state(false);
  let isExpanded = $state(false);

  /** Icon and color based on the active backend. */
  const statusInfo = $derived.by(() => {
    if (!capabilities) {
      return { icon: "mdi:chip-off", color: "surface", label: "AI idle" };
    }
    if (capabilities.runtimeReady && capabilities.webgpu) {
      return { icon: "mdi:lightning-bolt", color: "success", label: "AI GPU" };
    }
    if (capabilities.runtimeReady) {
      return { icon: "mdi:chip", color: "warning", label: "AI CPU" };
    }
    if (capabilities.webgpu || capabilities.xnnpack) {
      return { icon: "mdi:progress-download", color: "warning", label: "AI loading" };
    }
    return { icon: "mdi:chip-off", color: "danger", label: "AI n/a" };
  });

  $effect(() => {
    if (autoDetect) {
      isLoading = true;
      ai.getCapabilities()
        .then((caps) => {
          capabilities = caps;
        })
        .catch(() => {
          capabilities = null;
        })
        .finally(() => {
          isLoading = false;
        });
    }
  });

  function toggleExpand() {
    isExpanded = !isExpanded;
  }
</script>

<div class="ai-status">
  <button
    class="ai-status__trigger"
    onclick={toggleExpand}
    disabled={!capabilities}
    aria-label="AI inference status: {statusInfo.label}"
    aria-expanded={isExpanded}
    title={capabilities?.label || "AI not available"}
  >
    <iconify-icon icon={statusInfo.icon} width={14} class="ai-status__icon ai-status__icon--{statusInfo.color}"></iconify-icon>
    <span class="ai-status__label">{statusInfo.label}</span>
    {#if isLoading}
      <span class="ai-status__spinner"></span>
    {/if}
  </button>

  {#if isExpanded && capabilities}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="ai-status__detail"
      role="tooltip"
      onclick={() => (isExpanded = false)}
    >
      <div class="ai-status__detail-row">
        <span>Runtime</span>
        <span class="ai-status__detail-value {capabilities.runtimeReady ? 'text-success' : 'text-danger'}">
          {capabilities.runtimeReady ? 'Loaded' : 'Pending'}
        </span>
      </div>
      <div class="ai-status__detail-row">
        <span>WebGPU</span>
        <span class="ai-status__detail-value {capabilities.webgpu ? 'text-success' : 'text-danger'}">
          {capabilities.webgpu ? 'Available' : 'Unavailable'}
        </span>
      </div>
      <div class="ai-status__detail-row">
        <span>WebNN (NPU)</span>
        <span class="ai-status__detail-value {capabilities.webnn ? 'text-success' : 'text-surface'}">
          {capabilities.webnn ? 'Available' : 'N/A'}
        </span>
      </div>
      <div class="ai-status__detail-row">
        <span>CPU (XNNPACK)</span>
        <span class="ai-status__detail-value {capabilities.xnnpack ? 'text-success' : 'text-surface'}">
          {capabilities.xnnpack ? 'Ready' : 'N/A'}
        </span>
      </div>
    </div>
  {/if}
</div>

<style>
  .ai-status {
    position: relative;
    display: inline-flex;
  }

  .ai-status__trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.6875rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    background: transparent;
    color: var(--admin-color-surface-500, #71717a);
    transition: background-color 0.15s;
  }

  .ai-status__trigger:hover {
    background: var(--admin-color-surface-100, #f4f4f5);
  }

  .ai-status__icon {
    display: inline-block;
  }

  .ai-status__icon--success { color: #22c55e; }
  .ai-status__icon--warning { color: #eab308; }
  .ai-status__icon--danger  { color: #ef4444; }
  .ai-status__icon--surface { color: #a1a1aa; }

  .ai-status__label {
    font-size: inherit;
  }

  .ai-status__spinner {
    display: inline-block;
    width: 0.625rem;
    height: 0.625rem;
    border: 1.5px solid var(--admin-color-surface-300, #d4d4d8);
    border-top-color: var(--admin-color-primary-500, #6366f1);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .ai-status__detail {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 50;
    margin-top: 0.25rem;
    min-width: 12rem;
    padding: 0.5rem;
    border-radius: 0.375rem;
    background: var(--admin-color-surface-50, #fafafa);
    border: 1px solid var(--admin-color-surface-200, #e4e4e7);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    cursor: pointer;
  }

  .ai-status__detail-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.75rem;
    color: var(--admin-color-surface-600, #52525b);
  }

  .ai-status__detail-value {
    font-weight: 600;
  }

  .text-success { color: #16a34a; }
  .text-danger  { color: #dc2626; }
  .text-surface { color: #a1a1aa; }
</style>
