/**
 * @file src/utils/useLivePreview.ts
 * @description Frontend utility for consuming live preview data from the CMS admin.
 *
 * Usage in a SvelteKit page (or any frontend consuming the CMS):
 *
 * ```ts
 * import { createLivePreviewListener } from '@utils/use-live-preview';
 *
 * onMount(() => {
 *   const { destroy } = createLivePreviewListener({
 *     onUpdate: (data) => {
 *       // Merge draft data into your page state
 *       pageData = { ...pageData, ...data };
 *     },
 *     visualEditing: true
 *   });
 *   return destroy;
 * });
 * ```
 *
 * Features:
 * - Real-time data synchronization via `postMessage`.
 * - Handshake protocol (`svelty:init`).
 * - **Visual Editing Bridge**: Clicking elements with `data-svelty-field` selects them in the CMS.
 * - **Automatic Highlighting**: Hover effects for editable fields.
 */

export interface LivePreviewOptions {
  /** Callback invoked with updated draft data from the CMS editor. */
  onUpdate: (data: Record<string, unknown>) => void;
  /** Restrict messages to a specific origin. Defaults to '*' (any origin). */
  origin?: string;
  /** Enable Visual In-Context Editing features (highlights, click-to-edit). */
  visualEditing?: boolean;
}

export function createLivePreviewListener(options: LivePreviewOptions): {
  destroy: () => void;
} {
  const { onUpdate, origin, visualEditing = false } = options;

  // --- 1. Message Handling ---

  function handleMessage(event: MessageEvent) {
    // Validate origin if specified
    if (origin && origin !== "*" && event.origin !== origin) {
      return;
    }

    // Handle data updates
    if (event.data?.type === "svelty:update" && event.data.data) {
      onUpdate(event.data.data);
    }

    // Handle field selection from CMS
    if (event.data?.type === "svelty:field:select" && event.data.fieldName) {
      const el = document.querySelector(`[data-svelty-field="${event.data.fieldName}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("svelty-field-active");
        setTimeout(() => el.classList.remove("svelty-field-active"), 2000);
      }
    }
  }

  // --- 2. Visual Editing Implementation ---

  let cleanupVisualEditing = () => {};

  if (visualEditing && typeof document !== "undefined") {
    // Inject base styles for visual editing
    const styleId = "svelty-live-preview-styles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.innerHTML = `
				[data-svelty-field] {
					transition: outline 0.2s ease-in-out;
					cursor: pointer !important;
				}
				[data-svelty-field]:hover {
					outline: 2px dashed #ff3e00 !important;
					outline-offset: 2px;
				}
				.svelty-field-active {
					outline: 2px solid #ff3e00 !important;
					outline-offset: 2px;
					animation: svelty-pulse 1s infinite;
				}
				@keyframes svelty-pulse {
					0% { opacity: 1; }
					50% { opacity: 0.7; }
					100% { opacity: 1; }
				}
			`;
      document.head.appendChild(style);
    }

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-svelty-field]");
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        const fieldName = target.getAttribute("data-svelty-field");
        if (fieldName && window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "svelty:field:click", fieldName }, "*");
        }
      }
    };

    const handleHover = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-svelty-field]");
      if (target) {
        const fieldName = target.getAttribute("data-svelty-field");
        if (fieldName && window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "svelty:field:hover", fieldName }, "*");
        }
      }
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("mouseover", handleHover, true);

    cleanupVisualEditing = () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("mouseover", handleHover, true);
      const style = document.getElementById(styleId);
      if (style) style.remove();
    };
  }

  // --- 3. Lifecycle & Initialization ---

  window.addEventListener("message", handleMessage);

  // Signal to the parent CMS admin that we are ready
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "svelty:init" }, "*");
  }

  return {
    destroy() {
      window.removeEventListener("message", handleMessage);
      cleanupVisualEditing();
    },
  };
}
