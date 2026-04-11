/**
 * @file src/types/workflow-types.ts
 * @description Types for the Review Stage Finite State Machine (FSM)
 */

export interface WorkflowState {
  id: string;
  label: string;
  color: string;
  isInitial?: boolean;
  isFinal?: boolean;
}

export interface WorkflowTransition {
  id: string;
  from: string;
  to: string;
  label: string;
  requiredRole?: string; // RBAC enforcement: the role required to trigger this transition
}

export interface WorkflowDefinition {
  _id?: string;
  tenantId?: string; // Multi-tenant isolation
  collectionId: string; // The collection this workflow applies to
  states: WorkflowState[];
  transitions: WorkflowTransition[];
  createdAt?: number;
  updatedAt?: number;
}

export interface WorkflowHistoryEntry {
  fromState: string;
  toState: string;
  userId: string;
  timestamp: number;
  comment?: string;
}

export interface WorkflowInstance {
  _id?: string; // Assigned by DB adapter
  tenantId?: string; // Multi-tenant isolation
  entryId: string; // The ID of the entry in the collection
  collectionId: string;
  currentState: string; // The ID of the current WorkflowState
  history: WorkflowHistoryEntry[];
}
