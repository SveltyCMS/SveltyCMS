/**
 * @file src/plugins/editable-website/types.ts
 * @description Type definitions for communication between CMS and Live Preview.
 *
 * Framework-agnostic postMessage protocol — works with SvelteKit, Astro, React, Vue, etc.
 */

/** Message sent from CMS to Child Window (Website) */
export interface CmsUpdateMessage {
  collection: string;
  data: Record<string, unknown>;
  type: "svelty:update";
}

/** Sent from CMS to Website to highlight/scroll to a specific field. */
export interface CmsFieldSelectMessage {
  fieldName: string;
  type: "svelty:field:select";
}

/** Message sent from Child Window (Website) to CMS on load — handshake readiness. */
export interface CmsInitMessage {
  type: "svelty:init";
  version?: string;
}

/** Sent from Website to CMS when a user clicks an editable field. */
export interface CmsFieldClickMessage {
  fieldName: string;
  type: "svelty:field:click";
}

/** Sent from Website to CMS when a user hovers over an editable field. */
export interface CmsFieldHoverMessage {
  fieldName: string;
  type: "svelty:field:hover";
}

/** Sent from Website to CMS with updated entry data (bidirectional visual editing). */
export interface CmsSaveMessage {
  type: "svelty:save";
  collection: string;
  data: Record<string, unknown>;
  source?: "visual" | "form";
}

/** Targeted field update — svedit document JSON or partial field value. */
export interface CmsPreviewUpdateMessage {
  type: "svelty:document:update";
  collection: string;
  fieldName: string;
  document: unknown;
}

/** CMS toggles inline visual editing mode in the preview iframe. */
export interface CmsEditModeMessage {
  type: "svelty:edit-mode";
  enabled: boolean;
}

export type CmsOutboundMessage = CmsUpdateMessage | CmsFieldSelectMessage | CmsEditModeMessage;

export type CmsInboundMessage =
  | CmsInitMessage
  | CmsFieldClickMessage
  | CmsFieldHoverMessage
  | CmsSaveMessage
  | CmsPreviewUpdateMessage;

export type CmsMessage = CmsOutboundMessage | CmsInboundMessage;

/** Custom event dispatched when preview edits should merge into the entry form. */
export interface PreviewUpdateEventDetail {
  data: Record<string, unknown>;
  fieldName?: string;
  source?: "visual" | "form";
}
