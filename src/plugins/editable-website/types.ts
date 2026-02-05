/**
 * @file src/plugins/editable-website/types.ts
 * @description Type definitions for communication between CMS and Live Preview
 */

/**
 * Message sent from CMS to Child Window (Website)
 */
export interface CmsUpdateMessage {
	type: 'svelty:update';
	data: Record<string, any>;
	collection: string;
}

/**
 * Message sent from Child Window (Website) to CMS on load
 * "Handshake" to confirm readiness
 */
export interface CmsInitMessage {
	type: 'svelty:init';
	version: string;
}

export type CmsMessage = CmsUpdateMessage | CmsInitMessage;
