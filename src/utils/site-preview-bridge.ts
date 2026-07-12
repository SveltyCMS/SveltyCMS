/**
 * @file src/utils/site-preview-bridge.ts
 * @description Client-side live preview bridge for the site starter (framework-agnostic protocol).
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
  const { onPreviewSave, onDocumentUpdate, saveDebounceMs = 300, ...baseOptions } = options;

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSave: Record<string, unknown> | null = null;

  const base = createLivePreviewListener({
    ...baseOptions,
    visualEditing: baseOptions.visualEditing ?? isInPreviewFrame(),
  });

  function flushSave() {
    if (pendingSave && onPreviewSave) {
      onPreviewSave(pendingSave);
      pendingSave = null;
    }
  }

  function scheduleSave(data: Record<string, unknown>) {
    pendingSave = { ...pendingSave, ...data };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      flushSave();
      saveTimer = null;
    }, saveDebounceMs);
  }

  function handleExtendedMessage(event: MessageEvent) {
    const msg = event.data;
    if (!msg?.type) return;

    if (msg.type === "svelty:edit-mode") {
      baseOptions.onEditModeChange?.(!!msg.enabled);
    }

    if (msg.type === "svelty:save") {
      const saveMsg = msg as CmsSaveMessage;
      if (saveMsg.data) scheduleSave(saveMsg.data);
    }

    if (msg.type === "svelty:document:update") {
      const docMsg = msg as CmsPreviewUpdateMessage;
      onDocumentUpdate?.(docMsg.fieldName, docMsg.document);
      if (docMsg.fieldName && docMsg.document !== undefined) {
        scheduleSave({ [docMsg.fieldName]: docMsg.document });
      }
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("message", handleExtendedMessage);
  }

  return {
    destroy() {
      if (saveTimer) clearTimeout(saveTimer);
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
  targetOrigin = "*",
) {
  if (!isInPreviewFrame()) return;
  const msg: CmsPreviewUpdateMessage = {
    type: "svelty:document:update",
    collection,
    fieldName,
    document,
  };
  window.parent.postMessage(msg, targetOrigin);
}

/** Posts a field click message to the CMS parent frame. */
export function postFieldClick(fieldName: string, targetOrigin = "*") {
  if (!isInPreviewFrame()) return;
  const msg: CmsFieldClickMessage = { type: "svelty:field:click", fieldName };
  window.parent.postMessage(msg, targetOrigin);
}

/** Posts a save payload to the CMS parent frame. */
export function postPreviewSave(
  collection: string,
  data: Record<string, unknown>,
  targetOrigin = "*",
) {
  if (!isInPreviewFrame()) return;
  const msg: CmsSaveMessage = {
    type: "svelty:save",
    collection,
    data,
    source: "visual",
  };
  window.parent.postMessage(msg, targetOrigin);
}
