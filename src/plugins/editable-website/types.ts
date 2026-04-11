/**
 * @file src/plugins/editable-website/types.ts
 * @description Type definitions for communication between CMS and Live Preview
 */

// Message sent from CMS to Child Window (Website)
export interface CmsUpdateMessage {
  collection: string;
  data: Record<string, any>;
  type: "svelty:update";
}

/**
 * Sent from CMS to Website to highlight/scroll to a specific field.
 */
export interface CmsFieldSelectMessage {
  fieldName: string;
  type: "svelty:field:select";
}

/**
 * Message sent from Child Window (Website) to CMS on load
 * "Handshake" to confirm readiness
 */
export interface CmsInitMessage {
  type: "svelty:init";
  version?: string;
}

/**
 * Sent from Website to CMS when a user clicks an editable field.
 */
export interface CmsFieldClickMessage {
  fieldName: string;
  type: "svelty:field:click";
}

/**
 * Sent from Website to CMS when a user hovers over an editable field.
 */
export interface CmsFieldHoverMessage {
  fieldName: string;
  type: "svelty:field:hover";
}

export type CmsMessage =
  | CmsUpdateMessage
  | CmsInitMessage
  | CmsFieldSelectMessage
  | CmsFieldClickMessage
  | CmsFieldHoverMessage;
