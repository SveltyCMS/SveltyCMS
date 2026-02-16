/**
 * @file src/services/automation/types.ts
 * @description Type definitions for the GUI-based Automation System.
 *
 * Features:
 * - Automation flow definitions (trigger → operations chain)
 * - Trigger types: event hooks, schedule, manual
 * - Operation types: webhook, email, log, transform, condition
 * - Execution log structure
 * - Token-aware payload configuration
 */

// ── Trigger Types ──────────────────────────────────────────────

/** Events that can trigger an automation */
export type AutomationEvent =
	| 'entry:create'
	| 'entry:update'
	| 'entry:delete'
	| 'entry:publish'
	| 'entry:unpublish'
	| 'media:upload'
	| 'media:delete'
	| 'webhook:success'
	| 'webhook:failure'
	| 'ai:response'
	| 'chat:message';

/** All available automation events with metadata for the GUI */
export const AUTOMATION_EVENTS: { event: AutomationEvent; label: string; icon: string; category: 'content' | 'media' }[] = [
	{ event: 'entry:create', label: 'Entry Created', icon: 'mdi:file-plus-outline', category: 'content' },
	{ event: 'entry:update', label: 'Entry Updated', icon: 'mdi:file-edit-outline', category: 'content' },
	{ event: 'entry:delete', label: 'Entry Deleted', icon: 'mdi:file-remove-outline', category: 'content' },
	{ event: 'entry:publish', label: 'Entry Published', icon: 'mdi:publish', category: 'content' },
	{ event: 'entry:unpublish', label: 'Entry Unpublished', icon: 'mdi:publish-off', category: 'content' },
	{ event: 'media:upload', label: 'Media Uploaded', icon: 'mdi:cloud-upload-outline', category: 'media' },
	{ event: 'media:delete', label: 'Media Deleted', icon: 'mdi:image-remove', category: 'media' }
];

export type TriggerType = 'event' | 'schedule' | 'manual';

export interface AutomationTrigger {
	type: TriggerType;
	/** Event hook config */
	events?: AutomationEvent[];
	/** Restrict to specific collections (empty = all) */
	collections?: string[];
	/** Cron expression for schedule triggers */
	cron?: string;
	/** Human-readable cron description */
	cronLabel?: string;
}

// ── Operation Types ────────────────────────────────────────────

export type OperationType = 'webhook' | 'email' | 'log' | 'set_field' | 'condition';

/** All operation types with metadata for the GUI */
export const OPERATION_TYPES: { type: OperationType; label: string; icon: string; description: string }[] = [
	{ type: 'webhook', label: 'Send Webhook', icon: 'mdi:webhook', description: 'Send an HTTP POST request to an external URL' },
	{ type: 'email', label: 'Send Email', icon: 'mdi:email-outline', description: 'Send an email notification' },
	{ type: 'log', label: 'Log Message', icon: 'mdi:text-box-outline', description: 'Write a message to the system log' },
	{ type: 'set_field', label: 'Set Field', icon: 'mdi:form-textbox', description: 'Modify a field value on the entry' },
	{ type: 'condition', label: 'Condition', icon: 'mdi:source-branch', description: 'Only continue if a condition is met' }
];

/** Webhook operation config */
export interface WebhookOperationConfig {
	url: string;
	method?: 'POST' | 'PUT' | 'PATCH';
	headers?: Record<string, string>;
	/** Token-aware body template (resolved at execution) */
	body?: string;
	secret?: string;
}

/** Email operation config */
export interface EmailOperationConfig {
	/** Token-aware recipient (e.g. "{{ entry.author_email }}") */
	to: string;
	/** Token-aware subject template */
	subject: string;
	/** Token-aware HTML body template */
	body: string;
}

/** Log operation config */
export interface LogOperationConfig {
	/** Token-aware message template */
	message: string;
	level: 'info' | 'warn' | 'error';
}

/** Set field operation config */
export interface SetFieldOperationConfig {
	/** Target field name */
	field: string;
	/** Token-aware value expression */
	value: string;
}

/** Condition operation config */
export interface ConditionOperationConfig {
	/** Field to check */
	field: string;
	operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'exists' | 'not_exists';
	/** Value to compare against */
	value?: string;
}

export type OperationConfig = WebhookOperationConfig | EmailOperationConfig | LogOperationConfig | SetFieldOperationConfig | ConditionOperationConfig;

export interface AutomationOperation {
	id: string;
	type: OperationType;
	label?: string;
	config: OperationConfig;
	/** If true, stop the chain on failure */
	stopOnError?: boolean;
}

// ── Automation Flow ────────────────────────────────────────────

export interface AutomationFlow {
	id: string;
	name: string;
	description?: string;
	active: boolean;
	trigger: AutomationTrigger;
	operations: AutomationOperation[];
	/** Execution stats */
	lastTriggered?: string;
	triggerCount?: number;
	failureCount?: number;
	/** Metadata */
	createdAt: string;
	updatedAt: string;
}

// ── Execution Log ──────────────────────────────────────────────

export type ExecutionStatus = 'success' | 'failure' | 'skipped';

export interface ExecutionLogEntry {
	id: string;
	automationId: string;
	automationName: string;
	event: AutomationEvent | 'manual' | 'schedule';
	status: ExecutionStatus;
	/** Per-operation results */
	operationResults: {
		operationId: string;
		type: OperationType;
		status: ExecutionStatus;
		duration: number;
		error?: string;
	}[];
	/** Total duration in ms */
	duration: number;
	timestamp: string;
	/** Trigger payload snapshot */
	triggerPayload?: unknown;
}

// ── Event Bus Types ────────────────────────────────────────────

export interface AutomationEventPayload {
	event: AutomationEvent;
	collection?: string;
	entryId?: string;
	data?: Record<string, unknown>;
	previousData?: Record<string, unknown>;
	user?: { email?: string; username?: string; _id?: string };
	timestamp: string;
}
