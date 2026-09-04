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
  /** When true, entries in this state must be assigned to a reviewer before they can leave it. */
  requiresAssignee?: boolean;
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
  name: string;
  description?: string;
  /** When true, entries may only be published (status "publish") while their
   * workflow instance sits in a final state. Admins keep an explicit override. */
  gatePublication?: boolean;
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
  /** Reviewer assigned while the entry is in a `requiresAssignee` state. */
  assigneeId?: string;
  history: WorkflowHistoryEntry[];
}
