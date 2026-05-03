/**
 * @file src/services/workflow-service.ts
 * @description Service for managing Review Stage workflows (FSM).
 * Handles persistence and RBAC-gated state transitions.
 */

import type { WorkflowDefinition, WorkflowInstance } from "@src/types/workflow-types";
import type { User, Role } from "@src/databases/auth/types";
import type { IDBAdapter, DatabaseId } from "@src/databases/db-interface";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { auditLogService, AuditEventType } from "@src/services/audit-log-service";
import { hasPermissionWithRoles, registerPermission } from "@src/databases/auth/permissions";

// Register workflow permission
registerPermission({
  _id: "workflow:transition" as DatabaseId,
  name: "Workflow Transition",
  action: "execute",
  type: "system",
  description: "Can execute content workflow transitions",
});

const getDbAdapter = async () => (await import("@src/databases/db")).dbAdapter as IDBAdapter;

export class WorkflowService {
  private static instance: WorkflowService;
  private readonly DEFINITIONS_COLLECTION = "workflow_definitions";
  private readonly INSTANCES_COLLECTION = "workflow_instances";

  private constructor() {}

  public static getInstance(): WorkflowService {
    if (!WorkflowService.instance) {
      WorkflowService.instance = new WorkflowService();
    }
    return WorkflowService.instance;
  }

  /**
   * Saves or updates a workflow definition.
   */
  public async saveWorkflow(
    definition: WorkflowDefinition,
    user: User,
    tenantId?: string,
  ): Promise<WorkflowDefinition> {
    const dbAdapter = await getDbAdapter();

    // Ensure only admins can manage workflows (or specific role if needed)
    if (user.role !== "admin") {
      throw new AppError("Only admins can manage workflows", 403, "FORBIDDEN");
    }

    // Validate Topology
    this.validateTopology(definition);

    const now = Date.now();
    const toSave = {
      ...definition,
      updatedAt: now,
      tenantId: (tenantId || definition.tenantId) as DatabaseId | undefined,
    };

    if (toSave._id) {
      await dbAdapter.crud.update(
        this.DEFINITIONS_COLLECTION,
        toSave._id as DatabaseId,
        toSave as any,
        { tenantId: tenantId as DatabaseId },
      );
    } else {
      toSave.createdAt = now;
      const result = await dbAdapter.crud.insert(this.DEFINITIONS_COLLECTION, toSave as any, {
        tenantId: tenantId as DatabaseId,
      });
      if (result.success) {
        toSave._id = result.data._id as string;
      }
    }

    logger.info(
      `Workflow saved for collection: ${toSave.collectionId} by user: ${user._id} (Tenant: ${tenantId || "global"})`,
    );
    return toSave;
  }

  /**
   * Deletes a workflow definition.
   */
  public async deleteWorkflow(workflowId: string, user: User, tenantId?: string): Promise<void> {
    const dbAdapter = await getDbAdapter();
    if (user.role !== "admin") {
      throw new AppError("Only admins can delete workflows", 403, "FORBIDDEN");
    }

    await dbAdapter.crud.delete(this.DEFINITIONS_COLLECTION, workflowId as DatabaseId, {
      tenantId: tenantId as DatabaseId,
    });
    logger.info(`Workflow ${workflowId} deleted by user: ${user._id}`);
  }

  public async getWorkflowForCollection(
    collectionId: string,
    tenantId?: string,
  ): Promise<WorkflowDefinition | null> {
    const dbAdapter = await getDbAdapter();
    try {
      const workflows = await dbAdapter.crud.findMany<any>(
        this.DEFINITIONS_COLLECTION,
        { collectionId },
        { tenantId: tenantId as DatabaseId },
      );

      // Fallback: If store is empty, query DB directly
      if (!workflows.success || workflows.data.length === 0) {
        return null;
      }

      return workflows.data[0] as WorkflowDefinition;
    } catch (err: any) {
      // If table doesn't exist yet, just assume no workflow
      if (err.message?.includes("no such table")) return null;
      throw err;
    }
  }

  /**
   * Gets the current workflow instance for a specific entry.
   */
  public async getWorkflowInstance(
    entryId: string,
    tenantId?: string,
  ): Promise<WorkflowInstance | null> {
    const dbAdapter = await getDbAdapter();
    try {
      const instances = await dbAdapter.crud.findMany<any>(
        this.INSTANCES_COLLECTION,
        { entryId },
        { tenantId: tenantId as DatabaseId },
      );
      return instances.success ? (instances.data[0] as WorkflowInstance) : null;
    } catch (err: any) {
      if (err.message?.includes("no such table")) return null;
      throw err;
    }
  }

  /**
   * Triggers a stage transition for a content entry.
   */
  public async transition(
    entryId: string,
    targetStateId: string,
    user: User,
    roles: Role[],
    tenantId?: string,
    comment?: string,
  ): Promise<WorkflowInstance> {
    const dbAdapter = await getDbAdapter();

    // 1. Get current instance
    let instance = await this.getWorkflowInstance(entryId, tenantId);

    // 2. Get workflow definition (either from instance or we must find it)
    let workflow: WorkflowDefinition | null = null;
    if (instance) {
      workflow = await this.getWorkflowForCollection(instance.collectionId, tenantId);
    } else {
      // Attempt auto-initialization if entry exists but no workflow instance
      // We need to know which collection the entry belongs to.
      // For now, if instance is missing, we might need collectionId from the request.
      throw new AppError(
        "Workflow instance not found for entry. It must be initialized first.",
        404,
        "NOT_FOUND",
      );
    }

    if (!workflow) {
      throw new AppError("No workflow defined for this collection", 404, "NOT_FOUND");
    }

    // 3. Find valid transition
    const transition = workflow.transitions.find(
      (t) => t.from === instance!.currentState && t.to === targetStateId,
    );
    if (!transition) {
      throw new AppError(
        `Invalid transition from ${instance.currentState} to ${targetStateId}`,
        400,
        "INVALID_TRANSITION",
      );
    }

    // 4. RBAC Check (Enterprise Grade)
    if (transition.requiredRole && user.role !== "admin") {
      // 1. Check if user has general permission to transition
      const hasBasePerm = hasPermissionWithRoles(user as any, "workflow:transition", roles);
      if (!hasBasePerm) {
        throw new AppError(
          "You do not have permission to execute workflow transitions",
          403,
          "FORBIDDEN",
        );
      }

      // 2. Check for specific transition role
      const hasRole = roles.some(
        (r) => r._id === transition.requiredRole || r.name === transition.requiredRole,
      );
      if (!hasRole) {
        throw new AppError(
          `This transition specifically requires the role: ${transition.requiredRole}`,
          403,
          "FORBIDDEN",
        );
      }
    }

    // 5. Update state
    const oldState = instance.currentState;
    instance.currentState = targetStateId;
    instance.history.push({
      fromState: oldState,
      toState: targetStateId,
      userId: user._id,
      timestamp: Date.now(),
      comment,
    });

    await dbAdapter.crud.update(
      this.INSTANCES_COLLECTION,
      instance._id as DatabaseId,
      instance as any,
      { tenantId: tenantId as DatabaseId },
    );

    // 6. Audit Log (Fixed API Mismatch)
    await auditLogService.logEvent({
      eventType: AuditEventType.WORKFLOW_TRANSITION,
      action: `Workflow transition: ${oldState} → ${targetStateId}`,
      actorId: user._id as DatabaseId,
      actorEmail: user.email,
      severity: "low",
      result: "success",
      details: {
        from: oldState,
        to: targetStateId,
        transitionId: transition.id,
        collectionId: instance.collectionId,
        entryId,
        comment: comment || "",
      },
      targetType: "workflow_instance",
      targetId: entryId as DatabaseId,
      tenantId: tenantId as DatabaseId,
    });

    return instance;
  }

  /**
   * Initializes a workflow for a new entry.
   */
  public async initializeWorkflow(
    entryId: string,
    collectionId: string,
    tenantId?: string,
  ): Promise<WorkflowInstance | null> {
    const workflow = await this.getWorkflowForCollection(collectionId, tenantId);

    // No workflow defined for this collection — return immediately.
    // The previous retry-with-backoff pattern (3 × 500ms = 1.5s sleep) was
    // catastrophic at high concurrency: every POST to a workflow-less collection
    // would block the caller for 1.5 seconds. Since getWorkflowForCollection
    // reads directly from the DB, a missing result means no workflow exists.
    if (!workflow) return null;

    const initialState = workflow.states?.find((s) => s.isInitial)?.id || workflow.states?.[0]?.id;
    if (!initialState) {
      logger.warn(`No valid initial state found for workflow: ${collectionId}`);
      return null;
    }

    const dbAdapter = await getDbAdapter();
    const instance: WorkflowInstance = {
      entryId,
      collectionId,
      tenantId,
      currentState: initialState,
      history: [],
    };

    const result = await dbAdapter.crud.insert(this.INSTANCES_COLLECTION, instance as any, {
      tenantId: tenantId as DatabaseId,
    });
    if (result.success) {
      instance._id = result.data._id as string;
    }
    return instance;
  }

  /**
   * Initializes workflows for multiple entries in a single optimized operation.
   */
  public async bulkInitializeWorkflow(
    entryIds: string[],
    collectionId: string,
    tenantId?: string,
  ): Promise<void> {
    if (entryIds.length === 0) return;

    // 1. Fetch workflow once for the whole batch
    const workflow = await this.getWorkflowForCollection(collectionId, tenantId);
    if (!workflow || !workflow.states || workflow.states.length === 0) return;

    const initialState = workflow.states.find((s) => s.isInitial)?.id || workflow.states[0]?.id;
    if (!initialState) {
      // Only warn if a workflow actually exists but is broken
      if (workflow._id) {
        logger.warn(`No valid initial state found for workflow: ${collectionId}`);
      }
      return;
    }

    // 2. Prepare instances
    const instances = entryIds.map((entryId) => ({
      entryId,
      collectionId,
      tenantId,
      currentState: initialState,
      history: [],
    }));

    const dbAdapter = await getDbAdapter();

    // 3. Batch insert instances
    if (dbAdapter.batch?.bulkInsert) {
      await dbAdapter.batch.bulkInsert(this.INSTANCES_COLLECTION, instances as any[]);
    } else {
      // Fallback to sequential if batch not supported by adapter
      for (const instance of instances) {
        await dbAdapter.crud.insert(this.INSTANCES_COLLECTION, instance as any, {
          tenantId: tenantId as DatabaseId,
        });
      }
    }
  }

  /**
   * Validates FSM topology.
   */
  private validateTopology(def: WorkflowDefinition): void {
    const stateIds = new Set(def.states.map((s) => s.id));
    const initials = def.states.filter((s) => s.isInitial);
    const finals = def.states.filter((s) => s.isFinal);

    if (def.states.length === 0) throw new AppError("Workflow must have at least one state", 400);
    if (initials.length !== 1) throw new AppError("Exactly one initial state required", 400);
    if (finals.length < 1) throw new AppError("At least one final state required", 400);

    for (const t of def.transitions) {
      if (!stateIds.has(t.from))
        throw new AppError(`Transition references unknown 'from' state: ${t.from}`, 400);
      if (!stateIds.has(t.to))
        throw new AppError(`Transition references unknown 'to' state: ${t.to}`, 400);
    }
  }
}

export const workflowService = WorkflowService.getInstance();
