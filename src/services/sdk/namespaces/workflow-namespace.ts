/**
 * @file src/services/sdk/namespaces/workflow-namespace.ts
 * @description Workflow namespace for LocalCMS — programmatic editorial FSM
 * access (definitions, instances, transitions, history) without HTTP.
 *
 * Delegates to the workflowService singleton (which resolves the active DB
 * adapter), so transition RBAC, assignee locks, publication gates, audit
 * logging and the workflow:transitioned automation event behave identically
 * to the /api/workflows REST path.
 *
 * ### Features:
 * - transition({ entryId, targetState, comment, assigneeId, user, roles }) — role-gated FSM advance
 * - getInstance / getHistory — current state + immutable transition history
 * - getWorkflowForCollection — cached definition peek for UI/automations
 */
import type { IDBAdapter } from "@src/databases/db-interface";
import type { User, Role } from "@src/databases/auth/types";
import type { WorkflowHistoryEntry } from "@src/types/workflow-types";
import { workflowService } from "@src/services/background/workflow-service";

export interface WorkflowTransitionOptions {
  /** The collection the entry belongs to (informational; state is read from the instance). */
  collectionId?: string;
  entryId: string;
  /** Target workflow state id — must be reachable via a defined transition. */
  targetState: string;
  comment?: string;
  /** Assignee for the target state (required when it has `requiresAssignee`). */
  assigneeId?: string;
  /** Actor performing the transition (RBAC + assignee locks apply). */
  user: User;
  /** Roles of the actor (used for transition.requiredRole checks). */
  roles?: Role[];
  tenantId?: string;
}

export class WorkflowNamespace {
  constructor(_adapter?: IDBAdapter) {}

  /** Cached workflow definition for a collection (null when none exists). */
  public async getWorkflowForCollection(
    collectionId: string,
    tenantId?: string,
  ): Promise<Awaited<ReturnType<typeof workflowService.getWorkflowForCollection>>> {
    return workflowService.getWorkflowForCollection(collectionId, tenantId);
  }

  /** Current workflow instance of an entry (null when not enrolled). */
  public async getInstance(
    entryId: string,
    tenantId?: string,
  ): Promise<Awaited<ReturnType<typeof workflowService.getWorkflowInstance>>> {
    return (await workflowService.getWorkflowInstance(entryId, tenantId)) ?? null;
  }

  /** Immutable transition history of an entry (empty when not enrolled). */
  public async getHistory(
    _collectionId: string,
    entryId: string,
    tenantId?: string,
  ): Promise<WorkflowHistoryEntry[]> {
    const instance = await workflowService.getWorkflowInstance(entryId, tenantId);
    return instance?.history ?? [];
  }

  /** Advance an entry through its workflow (role-gated, audit-logged). */
  public async transition(
    options: WorkflowTransitionOptions,
  ): Promise<Awaited<ReturnType<typeof workflowService.transition>>> {
    return workflowService.transition(
      options.entryId,
      options.targetState,
      options.user,
      options.roles ?? [],
      options.tenantId,
      options.comment,
      options.assigneeId,
    );
  }
}
