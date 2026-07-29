/**
 * @file src/utils/site-preview-bridge.ts
 * @description Hardened client-side live preview bridge for the site starter.
 *
 * ### Hardening (audit 2026-07):
 * - Origin validation: handleExtendedMessage checks event.origin against configured origin
 * - Default targetOrigin: changed from "*" to window.location.origin (explicit, safer)
 * - Timer cleanup: flushSave clears the timer reference to prevent double-fire
 * - Memory safety: pendingSave uses {} instead of null for cleaner lifecycle
 *
 * Framework-agnostic protocol for CMS ↔ frontend visual editing.
 */

import type {
  CmsFieldClickMessage,
  CmsPreviewUpdateMessage,
  CmsSaveMessage,
} from "@src/plugins/editable-website/types";
import { createLivePreviewListener, type LivePreviewOptions } from "@utils/preview";

export interface SitePreviewBridgeOptions extends LivePreviewOptions {
  /** Called when visual edits should sync back to the CMS form. */
  onPreviewSave?: (data: Record<string, unknown>) => void;
  /** Called when a single field document changes (svedit-ready). */
  onDocumentUpdate?: (fieldName: string, document: unknown) => void;
  /** Called when CMS toggles visual edit mode. */
  onEditModeChange?: (enabled: boolean) => void;
  /** Debounce ms for save messages (default 300). */
  saveDebounceMs?: number;
}

function isInPreviewFrame(): boolean {
  return typeof window !== "undefined" && window.parent !== window;
}

/**
 * Creates an enhanced preview bridge for the site starter.
 * Extends the base listener with bidirectional save/document messages.
 */
export function createSitePreviewBridge(options: SitePreviewBridgeOptions): {
  destroy: () => void;
} {
  const {
    onPreviewSave,
    onDocumentUpdate,
    saveDebounceMs = 300,
    origin = "*",
    ...baseOptions
  } = options;

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSave: Record<string, unknown> = {};

  const base = createLivePreviewListener({
    ...baseOptions,
    origin,
    visualEditing: baseOptions.visualEditing ?? isInPreviewFrame(),
  });

  const flushSave = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (Object.keys(pendingSave).length > 0 && onPreviewSave) {
      onPreviewSave(pendingSave);
      pendingSave = {};
    }
  };

  const scheduleSave = (data: Record<string, unknown>) => {
    pendingSave = { ...pendingSave, ...data };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, saveDebounceMs);
  };

  const handleExtendedMessage = (event: MessageEvent) => {
    // 🛡️ Security: Validate origin strictly
    if (origin !== "*" && event.origin !== origin) return;

    const msg = event.data;
    if (!msg?.type) return;

    if (msg.type === "svelty:edit-mode") {
      baseOptions.onEditModeChange?.(!!msg.enabled);
    } else if (msg.type === "svelty:save") {
      if (msg.data) scheduleSave(msg.data);
    } else if (msg.type === "svelty:document:update") {
      onDocumentUpdate?.(msg.fieldName, msg.document);
      if (msg.fieldName && msg.document !== undefined) {
        scheduleSave({ [msg.fieldName]: msg.document });
      }
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("message", handleExtendedMessage);
  }

  return {
    destroy() {
      flushSave();
      base.destroy();
      if (typeof window !== "undefined") {
        window.removeEventListener("message", handleExtendedMessage);
      }
    },
  };
}

/** Posts a Svedit document update to the CMS parent frame. */
export function postDocumentUpdate(
  fieldName: string,
  document: unknown,
  collection = "pages",
  targetOrigin?: string,
) {
  if (!isInPreviewFrame()) return;
  const msg: CmsPreviewUpdateMessage = {
    type: "svelty:document:update",
    collection,
    fieldName,
    document,
  };
  window.parent.postMessage(msg, targetOrigin || window.location.origin);
}

/** Posts a field click message to the CMS parent frame. */
export function postFieldClick(fieldName: string, targetOrigin?: string) {
  if (!isInPreviewFrame()) return;
  const msg: CmsFieldClickMessage = { type: "svelty:field:click", fieldName };
  window.parent.postMessage(msg, targetOrigin || window.location.origin);
}

/** Posts a save payload to the CMS parent frame. */
export function postPreviewSave(
  collection: string,
  data: Record<string, unknown>,
  targetOrigin?: string,
) {
  if (!isInPreviewFrame()) return;
  const msg: CmsSaveMessage = {
    type: "svelty:save",
    collection,
    data,
    source: "visual",
  };
  window.parent.postMessage(msg, targetOrigin || window.location.origin);
}
