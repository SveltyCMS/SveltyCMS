/**
 * @file src/plugins/editable-website/preview-bridge.ts
 * @description Browser-side preview bridge for the Editable Website plugin.
 *
 * This module provides utilities that run **inside the previewed website**
 * (the code loaded in the Live Preview iframe). It wire up the postMessage
 * handshake with the CMS and intercepts navigation clicks so the preview
 * iframe doesn't navigate away from the previewed page.
 *
 * ### Click Handling Fix (aphexcms visual-editing@0.2.0 parity):
 * Previous implementations ran `preventDefault()` on EVERY click in the
 * capture phase. This broke all interactive elements whose default action
 * is a click — `<details>/<summary>` toggles, checkboxes, radios, etc.
 * The corrected handler below only cancels navigation-intent clicks:
 * anchor links and submit/reset buttons. Everything else passes through.
 *
 * ### Features:
 * - postMessage handshake with CMS (svelty:init)
 * - navigation cancellation (anchors + submit/reset only)
 * - field click/hover detection for visual editing
 * - svelty:save document update dispatch
 */

import type {
  CmsFieldClickMessage,
  CmsFieldHoverMessage,
  CmsInitMessage,
  CmsSaveMessage,
} from "./types";

// ============================================================================
// Navigation-aware Click Handler
// ============================================================================

/**
 * Determine whether a click event's default action should be cancelled.
 *
 * Uses `.closest()` to find the nearest semantic controller up the DOM
 * tree. This handles clicks on children of anchors/buttons/inputs
 * (e.g., `<a><span>Click</span></a>` clicks the `<span>`, but the `<a>`
 * is the navigation element that should be cancelled).
 *
 * Only anchors and submit/reset controls are cancelled — all other
 * interactive elements (details/summary, checkboxes, radios, range
 * inputs, etc.) pass through normally.
 */
function shouldCancelClick(target: HTMLElement): boolean {
  // Find the nearest structural semantic controller up the tree.
  // This handles clicks on children of anchors/buttons/inputs.
  const host = target.closest("a, button, input");
  if (!host) return false;

  const tag = host.tagName.toLowerCase();

  // Anchor links always navigate — cancel them
  if (tag === "a") return true;

  // Only cancel submit and reset buttons
  if (tag === "button") {
    const btn = host as HTMLButtonElement;
    return btn.type === "submit" || btn.type === "reset";
  }

  // input[type="submit"], input[type="reset"], input[type="image"]
  if (tag === "input") {
    const input = host as HTMLInputElement;
    return input.type === "submit" || input.type === "reset" || input.type === "image";
  }

  // Everything else passes through freely.
  return false;
}

/**
 * Global click listener installed on the previewed document.
 *
 * Runs in the **capture phase** so we can intercept before the event
 * reaches the target. Cancels navigation-intent clicks (anchors,
 * submit/reset) while letting interactive element toggles pass through.
 */
export function handlePreviewClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (!target) return;

  if (shouldCancelClick(target)) {
    event.preventDefault();

    // For anchor links: post a navigation message so the CMS can warn
    // the user that the preview tried to navigate away.
    // Use `.closest()` to find the anchor even when a child element was clicked.
    const anchor = target.closest("a") as HTMLAnchorElement | null;
    if (anchor) {
      const href = anchor.getAttribute("href") || anchor.href || "";
      window.parent.postMessage(
        {
          type: "svelty:navigate",
          href,
          text: anchor.textContent?.trim() || "",
        },
        "*",
      );
    }
  }
}

// ============================================================================
// Bridge Initialization
// ============================================================================

/**
 * Options for initializing the preview bridge.
 */
export interface PreviewBridgeOptions {
  /** Protocol version for handshake. */
  version?: string;
  /** Whether to install the click-intercepting listener. Default: true. */
  interceptClicks?: boolean;
  /** Whether to install field hover/click detection. Default: false. */
  enableFieldDetection?: boolean;
  /** Target origin for postMessage (default "*"). */
  targetOrigin?: string;
}

/**
 * Initialize the preview bridge inside the previewed website.
 *
 * Sends the `svelty:init` handshake message to the parent CMS window
 * and optionally installs click interception and field detection.
 *
 * Call this once at the top of the previewed page's script.
 */
export function initPreviewBridge(options: PreviewBridgeOptions = {}): void {
  const {
    version = "1.0.0",
    interceptClicks = true,
    enableFieldDetection = false,
    targetOrigin = "*",
  } = options;

  // --- Handshake ---
  const initMsg: CmsInitMessage = { type: "svelty:init", version };
  window.parent.postMessage(initMsg, targetOrigin);

  // --- Click interception (navigation-aware) ---
  if (interceptClicks) {
    document.addEventListener("click", handlePreviewClick, true);
  }

  // --- Field hover / click detection ---
  if (enableFieldDetection) {
    installFieldDetection(targetOrigin);
  }
}

/**
 * Tear down the preview bridge listeners.
 */
export function destroyPreviewBridge(): void {
  document.removeEventListener("click", handlePreviewClick, true);
  lastTrackedElement = null;
  lastTrackedFieldName = null;
}

// ============================================================================
// Field Detection (Visual Editing)
// ============================================================================

function installFieldDetection(targetOrigin: string): void {
  // Hover detection — notify CMS which field is under the cursor
  document.addEventListener(
    "mouseover",
    (event) => {
      const target = event.target as HTMLElement;
      if (!target) return;
      const fieldName = getEditableFieldName(target);
      if (!fieldName) return;

      const msg: CmsFieldHoverMessage = {
        type: "svelty:field:hover",
        fieldName,
      };
      window.parent.postMessage(msg, targetOrigin);
    },
    true,
  );

  // Click detection — notify CMS that a field was clicked for editing
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement;
      if (!target) return;
      const fieldName = getEditableFieldName(target);
      if (!fieldName) return;

      const msg: CmsFieldClickMessage = {
        type: "svelty:field:click",
        fieldName,
      };
      window.parent.postMessage(msg, targetOrigin);
    },
    true,
  );
}

// O(1) cache: avoid redundant DOM walks during rapid mouseover sequences.
// The same element is often hit many times in quick succession (multi-frame
// passes during scrolling). Short-circuit the walk when the target hasn't
// changed since the last invocation.
let lastTrackedElement: HTMLElement | null = null;
let lastTrackedFieldName: string | null = null;

/**
 * Walk up the DOM from `el` looking for a `[data-svelty-field]` attribute.
 * Caches the last result per element to avoid redundant DOM climbs during
 * rapid mouseover events. Returns the field name if found, otherwise `null`.
 */
function getEditableFieldName(el: HTMLElement | null): string | null {
  if (!el) return null;

  // Short-circuit: same element as last call → return cached result
  if (el === lastTrackedElement) return lastTrackedFieldName;

  lastTrackedElement = el;

  // Use native `.closest()` — O(1) delegation via browser's internal
  // tree walk, much faster than manual `while` loop up parentElement.
  const match = el.closest("[data-svelty-field]");
  lastTrackedFieldName = match ? match.getAttribute("data-svelty-field") : null;

  return lastTrackedFieldName;
}

// ============================================================================
// Document Update Dispatch
// ============================================================================

/**
 * Send an updated document back to the CMS for preview syncing.
 *
 * Called by the website-side visual editor (e.g., Svedit) when the user
 * edits content inline within the preview.
 */
export function dispatchDocumentUpdate(
  collection: string,
  data: Record<string, unknown>,
  targetOrigin: string = "*",
): void {
  const msg: CmsSaveMessage = {
    type: "svelty:save",
    collection,
    data,
    source: "visual",
  };
  window.parent.postMessage(msg, targetOrigin);
}
