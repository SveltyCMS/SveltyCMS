/**
 * @file src/plugins/editable-website/protocol.ts
 * @description Helpers for the editable-website postMessage protocol.
 */

import type {
  CmsInboundMessage,
  CmsPreviewUpdateMessage,
  CmsSaveMessage,
  PreviewUpdateEventDetail,
} from "./types";

export const PREVIEW_PROTOCOL_VERSION = "1.2.0";

export function isCmsInboundMessage(data: unknown): data is CmsInboundMessage {
  if (!data || typeof data !== "object") return false;
  const type = (data as { type?: string }).type;
  return (
    type === "svelty:init" ||
    type === "svelty:field:click" ||
    type === "svelty:field:hover" ||
    type === "svelty:save" ||
    type === "svelty:document:update"
  );
}

export function mergePreviewEdits(
  current: Record<string, unknown>,
  msg: CmsSaveMessage | CmsPreviewUpdateMessage,
): Record<string, unknown> {
  if (msg.type === "svelty:save") {
    return { ...current, ...msg.data };
  }

  return {
    ...current,
    [msg.fieldName]: msg.document,
  };
}

export function dispatchPreviewUpdate(detail: PreviewUpdateEventDetail) {
  if (typeof document === "undefined") return;
  document.dispatchEvent(
    new CustomEvent("svelty:preview-update", {
      detail,
      bubbles: true,
      composed: true,
    }),
  );
}
