/**
 * @file src/services/automation/index.ts
 * @description Barrel export for the Automation System.
 *
 * Features:
 * - EventBus for CMS lifecycle events
 * - AutomationService for flow management and execution
 * - Type definitions for triggers, operations, and flows
 */

export { eventBus } from './eventBus';
export { automationService } from './automationService';
export { AUTOMATION_EVENTS, OPERATION_TYPES } from './types';
export type {
	AutomationFlow,
	AutomationOperation,
	AutomationTrigger,
	AutomationEvent,
	AutomationEventPayload,
	TriggerType,
	OperationType,
	ExecutionLogEntry,
	ExecutionStatus,
	WebhookOperationConfig,
	EmailOperationConfig,
	LogOperationConfig,
	SetFieldOperationConfig,
	ConditionOperationConfig,
	OperationConfig
} from './types';
