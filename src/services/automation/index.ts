/**
 * @file src/services/automation/index.ts
 * @description Barrel export for the Automation System.
 *
 * Features:
 * - EventBus for CMS lifecycle events
 * - AutomationService for flow management and execution
 * - Type definitions for triggers, operations, and flows
 */

export { automationService } from './automationService';
export { eventBus } from './eventBus';
export type {
	AutomationEvent,
	AutomationEventPayload,
	AutomationFlow,
	AutomationOperation,
	AutomationTrigger,
	ConditionOperationConfig,
	EmailOperationConfig,
	ExecutionLogEntry,
	ExecutionStatus,
	LogOperationConfig,
	OperationConfig,
	OperationType,
	SetFieldOperationConfig,
	TriggerType,
	WebhookOperationConfig
} from './types';
export { AUTOMATION_EVENTS, OPERATION_TYPES } from './types';
