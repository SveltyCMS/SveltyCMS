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

/**
 * Major versions must match. A site that omits the version (legacy bridge) is
 * accepted so existing installs keep working; only an explicit mismatch warns.
 */
export function isCompatibleProtocolVersion(
  version: unknown,
  current: string = PREVIEW_PROTOCOL_VERSION,
): boolean {
  if (typeof version !== "string" || !version) return true;
  return version.split(".")[0] === current.split(".")[0];
}

/**
 * Resolve the `postMessage` target origin for a frame URL. Returns `null` when
 * the URL cannot be parsed — callers must then skip the post rather than fall
 * back to `"*"` (which would broadcast the entry payload to any embedder).
 */
export function resolveFrameTargetOrigin(url: string, fallback?: string): string | null {
  if (!url) return null;
  const candidate = url.startsWith("http") ? url : fallback ? `${fallback}${url}` : url;
  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

/**
 * Field name of a focused CMS control, for CMS → preview field highlighting.
 * The entry form ids controls by `db_fieldName`; `name` is the fallback.
 */
export function fieldNameFromElement(
  element: Pick<HTMLElement, "id" | "getAttribute"> | null,
): string | null {
  if (!element) return null;
  const id = typeof element.id === "string" ? element.id.trim() : "";
  if (id) return id;
  const name = element.getAttribute?.("name")?.trim();
  return name || null;
}

export function isCmsInboundMessage(data: unknown): data is CmsInboundMessage {
  if (!data || typeof data !== "object") return false;
  const type = (data as { type?: string }).type;
  return (
    type === "svelty:init" ||
    type === "svelty:field:click" ||
    type === "svelty:field:hover" ||
    type === "svelty:save" ||
    type === "svelty:document:update" ||
    type === "svelty:navigate"
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
