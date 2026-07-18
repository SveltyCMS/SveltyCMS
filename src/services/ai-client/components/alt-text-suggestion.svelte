<!--
 @file src/services/ai-client/components/alt-text-suggestion.svelte
 @component Alt-text suggestion button for the image editor / media upload flow.

 Uses LiteRT.js (via the isolated Web Worker) to generate alt-text from an image
 entirely in the browser — zero server cost, zero data egress.

 ### Features:
 - one-click alt-text generation
 - confidence indicator (color-coded badge)
 - "powered by AI" indicator showing backend (LiteRT.js vs Ollama)
 - keyboard-accessible (WCAG 2.2 AA)
 - ARIA live region for screen reader announcements
-->

<script lang="ts">
  import { ai } from "@src/services/ai-client";
  import type { AltTextResult } from "@src/services/ai-client/types";

  interface Props {
    /** Raw image bytes to analyze. */
    imageData: ArrayBuffer;
    /** MIME type (e.g., "image/jpeg", "image/png"). */
    mimeType: string;
    /** Currently set alt-text (to avoid overwriting manual input). */
    currentAltText?: string;
    /** Called when a suggestion is generated. */
    onsuggestion?: (suggestion: AltTextResult) => void;
  }

  let {
    imageData,
    mimeType,
    currentAltText = "",
    onsuggestion,
  }: Props = $props();

  let isGenerating = $state(false);
  let suggestion: AltTextResult | null = $state(null);
  let errorMessage = $state("");

  /** Confidence color for the badge. */
  const confidenceColor = $derived.by(() => {
    if (!suggestion) return "surface";
    if (suggestion.confidence >= 0.8) return "success";
    if (suggestion.confidence >= 0.5) return "warning";
    return "danger";
  });

  /** Human-readable backend label. */
  const backendLabel = $derived.by(() => {
    if (!suggestion) return "";
    switch (suggestion.backend) {
      case "litert": return "Browser AI (LiteRT.js)";
      case "ollama": return "Server AI (Ollama)";
      default: return "Unavailable";
    }
  });

  const hasManualContent = $derived(currentAltText.trim().length > 0);

  async function handleGenerate() {
    isGenerating = true;
    errorMessage = "";

    try {
      const result = await ai.generateAltText(imageData, mimeType);
      suggestion = result;

      if (result.altText && onsuggestion) {
        onsuggestion(result);
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Failed to generate alt-text";
      suggestion = {
        altText: "",
        confidence: 0,
        backend: "failed",
        latencyMs: 0,
      };
    } finally {
      isGenerating = false;
    }
  }

  function handleApply() {
    if (suggestion?.altText && onsuggestion) {
      onsuggestion(suggestion);
    }
  }

  function handleDismiss() {
    suggestion = null;
    errorMessage = "";
  }
</script>

<div class="ai-alt-text">
  {#if isGenerating}
    <button
      class="btn ai-btn ai-btn--generating"
      disabled
      aria-label="Generating alt-text with AI"
      aria-busy="true"
    >
      <iconify-icon icon="mdi:sparkles" class="ai-sparkle" width={16}></iconify-icon>
      <span class="ai-label">Generating...</span>
      <span class="ai-badge ai-badge--pending">running</span>
    </button>

  {:else if suggestion && suggestion.altText}
    <!-- ARIA live region so screen readers announce the suggestion -->
    <div aria-live="polite" aria-atomic="true" class="sr-only">
      Alt-text suggestion generated: {suggestion.altText}
    </div>

    <div class="ai-result">
      <div class="ai-result__header">
        <span class="ai-result__label">
          <iconify-icon icon="mdi:lightbulb-outline" width={14}></iconify-icon>
          AI Suggestion
        </span>
        <span class="ai-result__backend" title={backendLabel}>
          {suggestion.backend === "litert" ? "Browser" : "Server"}
        </span>
        <span class="ai-badge ai-badge--{confidenceColor}">
          {Math.round(suggestion.confidence * 100)}%
        </span>
      </div>

      <p class="ai-result__text">{suggestion.altText}</p>

      <div class="ai-result__actions">
        <button
          class="btn btn--sm btn--primary"
          onclick={handleApply}
          aria-label="Apply suggested alt-text"
        >
          Apply
        </button>
        <button
          class="btn btn--sm btn--ghost"
          onclick={handleDismiss}
          aria-label="Dismiss suggestion"
        >
          Dismiss
        </button>
        <button
          class="btn btn--sm btn--ghost"
          onclick={handleGenerate}
          aria-label="Generate new suggestion"
        >
          Regenerate
        </button>
      </div>
    </div>

  {:else if errorMessage}
    <div class="ai-error" role="alert">
      <iconify-icon icon="mdi:alert-circle-outline" width={14}></iconify-icon>
      <span>{errorMessage}</span>
      <button
        class="btn btn--sm btn--ghost"
        onclick={() => (errorMessage = "")}
        aria-label="Dismiss error"
      >
        Dismiss
      </button>
    </div>

    <button class="btn ai-btn" onclick={handleGenerate} aria-label="Retry AI alt-text generation">
      <iconify-icon icon="mdi:sparkles" class="ai-sparkle" width={16}></iconify-icon>
      <span class="ai-label">Retry Alt-Text AI</span>
    </button>

  {:else}
    <button
      class="btn ai-btn"
      onclick={handleGenerate}
      disabled={isGenerating}
      aria-label="Generate alt-text with AI"
      title={hasManualContent ? "Overwrite existing alt-text with AI suggestion" : "Generate alt-text suggestion"}
    >
      <iconify-icon icon="mdi:sparkles" class="ai-sparkle" width={16}></iconify-icon>
      <span class="ai-label">
        {hasManualContent ? "Suggest Alt-Text" : "Generate Alt-Text"}
      </span>
      {#if suggestion}
        <span class="ai-badge ai-badge--surface">retry</span>
      {/if}
    </button>
  {/if}
</div>

<style>
  .ai-alt-text {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .ai-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s, background-color 0.15s;
    border: 1px solid var(--admin-color-surface-300, #d4d4d8);
    background: var(--admin-color-surface-100, #f4f4f5);
    color: var(--admin-color-text, #18181b);
  }

  .ai-btn:hover:not(:disabled) {
    background: var(--admin-color-primary-100, #e0e7ff);
    border-color: var(--admin-color-primary-400, #818cf8);
  }

  .ai-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ai-btn--generating {
    background: var(--admin-color-primary-50, #eef2ff);
    border-color: var(--admin-color-primary-300, #a5b4fc);
  }

  .ai-sparkle {
    color: var(--admin-color-primary-500, #6366f1);
    animation: pulse 2s ease-in-out infinite;
  }

  .ai-btn--generating .ai-sparkle {
    animation: spin 1.5s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .ai-label {
    font-size: inherit;
  }

  .ai-badge {
    font-size: 0.6875rem;
    padding: 0.0625rem 0.375rem;
    border-radius: 0.25rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .ai-badge--success { background: #bbf7d0; color: #166534; }
  .ai-badge--warning { background: #fef08a; color: #854d0e; }
  .ai-badge--danger  { background: #fecaca; color: #991b1b; }
  .ai-badge--surface { background: #e4e4e7; color: #3f3f46; }
  .ai-badge--pending { background: #dbeafe; color: #1e40af; }

  .ai-result {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    background: var(--admin-color-surface-50, #fafafa);
    border: 1px solid var(--admin-color-primary-200, #c7d2fe);
  }

  .ai-result__header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
  }

  .ai-result__label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: 600;
    color: var(--admin-color-primary-700, #4338ca);
  }

  .ai-result__backend {
    color: var(--admin-color-surface-500, #71717a);
    font-size: 0.6875rem;
  }

  .ai-result__text {
    font-size: 0.875rem;
    line-height: 1.4;
    color: var(--admin-color-text, #18181b);
    margin: 0;
  }

  .ai-result__actions {
    display: flex;
    gap: 0.375rem;
    margin-top: 0.25rem;
  }

  .ai-error {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    color: var(--admin-color-danger-700, #991b1b);
    background: var(--admin-color-danger-50, #fef2f2);
    border: 1px solid var(--admin-color-danger-200, #fecaca);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>
