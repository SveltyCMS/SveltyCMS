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
import { generateUUID } from "@utils/native-utils";
import { auditLogService, AuditEventType } from "@src/services/security/audit-service";
import { hasPermissionWithRoles, registerPermission } from "@src/databases/auth/permissions";
import { isAdmin } from "@src/databases/auth/constants";
import { eventBus } from "./automation/event-bus";

// Register workflow permission
registerPermission({
  _id: "workflow:transition" as DatabaseId,
  name: "Workflow Transition",
  action: "execute",
  type: "system",
  description: "Can execute content workflow transitions",
});

const getDbAdapter = async () => (await import("@src/databases/db")).dbAdapter as IDBAdapter;

/** Admins/super-admins keep an explicit override over gates and assignee locks. */
function isAdminActor(user: User): boolean {
  return isAdmin(user);
}

/**
 * Workflow Service (Singleton)
 */
export class WorkflowService {
  private readonly DEFINITIONS_COLLECTION = "workflow_definitions";
  private readonly INSTANCES_COLLECTION = "workflow_instances";

  /**
   * Negative + positive cache for getWorkflowForCollection.
   * Most collections have no workflow — avoid a DB round-trip on every create.
   */
  private readonly _workflowByCollection = new Map<
    string,
    { value: WorkflowDefinition | null; exp: number }
  >();
  private static readonly WORKFLOW_CACHE_TTL_MS = 60_000;

  constructor() {}

  /** Invalidate cached workflow lookup after definition save/delete. */
  public invalidateWorkflowCache(_collectionId?: string, _tenantId?: string): void {
    // Full clear for now; scoped invalidation can use _collectionId/_tenantId later
    this._workflowByCollection.clear();
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

    // Ensure only admins can manage workflows
    if (!isAdminActor(user)) {
      throw new AppError("Only admins can manage workflows", 403, "FORBIDDEN");
    }

    // Validate Topology
    this.validateTopology(definition);

    const now = Date.now();
    // name is NOT NULL in SQL schemas — never insert without a non-empty name
    const safeName =
      (typeof definition.name === "string" && definition.name.trim()) ||
      definition.collectionId ||
      "Untitled Workflow";
    const generatedId = (definition._id || (definition as any).id || generateUUID()) as string;
    const toSave = {
      ...definition,
      _id: generatedId,
      id: generatedId,
      name: safeName,
      updatedAt: now,
      tenantId: (tenantId || definition.tenantId) as DatabaseId | undefined,
    };

    const existing = await dbAdapter.crud.findOne(
      this.DEFINITIONS_COLLECTION,
      { _id: generatedId } as any,
      { tenantId: tenantId as DatabaseId },
    );

    if (existing && existing.success && existing.data) {
      await dbAdapter.crud.update(
        this.DEFINITIONS_COLLECTION,
        generatedId as DatabaseId,
        toSave as any,
        { tenantId: tenantId as DatabaseId },
      );
    } else {
      toSave.createdAt = now;
      const result = await dbAdapter.crud.insert(this.DEFINITIONS_COLLECTION, toSave as any, {
        tenantId: tenantId as DatabaseId,
      });
      if (result.success && result.data) {
        const resId = String((result.data as any)._id || (result.data as any).id || generatedId);
        toSave._id = resId;
        (toSave as any).id = resId;
      }
    }

    this.invalidateWorkflowCache(toSave.collectionId, tenantId);
    logger.info(
      `Workflow saved for collection: ${toSave.collectionId} by user: ${user._id} (Tenant: ${tenantId || "global"})`,
    );
    return this.normalizeDefinition(toSave);
  }

  /**
   * Deletes a workflow definition.
   */
  public async deleteWorkflow(workflowId: string, user: User, tenantId?: string): Promise<void> {
    const dbAdapter = await getDbAdapter();
    if (!isAdminActor(user)) {
      throw new AppError("Only admins can delete workflows", 403, "FORBIDDEN");
    }

    await dbAdapter.crud.delete(this.DEFINITIONS_COLLECTION, workflowId as DatabaseId, {
      tenantId: tenantId as DatabaseId,
    });
    this.invalidateWorkflowCache(undefined, tenantId);
    logger.info(`Workflow ${workflowId} deleted by user: ${user._id}`);
  }

  /**
   * Sync peek of the workflow cache. `undefined` = unknown (need a lookup),
   * `null` = confirmed no workflow, otherwise the cached definition.
   */
  public peekWorkflowCache(
    collectionId: string,
    tenantId?: string,
  ): WorkflowDefinition | null | undefined {
    const cacheKey = `${tenantId || "global"}:${collectionId}`;
    const cached = this._workflowByCollection.get(cacheKey);
    if (!cached || cached.exp <= Date.now()) return undefined;
    return cached.value;
  }

  public async getWorkflowForCollection(
    collectionId: string,
    tenantId?: string,
  ): Promise<WorkflowDefinition | null> {
    const cacheKey = `${tenantId || "global"}:${collectionId}`;
    const cached = this._workflowByCollection.get(cacheKey);
    if (cached && cached.exp > Date.now()) {
      return cached.value;
    }

    const dbAdapter = await getDbAdapter();
    try {
      // Tenant-scoped lookup (parity with save/delete). Single-tenant: undefined is fine.
      const workflows = await dbAdapter.crud.findMany<any>(
        this.DEFINITIONS_COLLECTION,
        { collectionId },
        { tenantId: tenantId as DatabaseId },
      );

      const items = workflows?.success && Array.isArray(workflows.data) ? workflows.data : [];

      if (!workflows?.success || items.length === 0) {
        logger.debug(
          `[WorkflowService] getWorkflowForCollection null for ${collectionId}: success=${workflows?.success}, count=${items.length}`,
        );
        this._workflowByCollection.set(cacheKey, {
          value: null,
          exp: Date.now() + WorkflowService.WORKFLOW_CACHE_TTL_MS,
        });
        return null;
      }

      const normalized = this.normalizeDefinition(items[0]);
      this._workflowByCollection.set(cacheKey, {
        value: normalized,
        exp: Date.now() + WorkflowService.WORKFLOW_CACHE_TTL_MS,
      });
      return normalized;
    } catch (err: any) {
      // If table doesn't exist yet, just assume no workflow
      if (err.message?.includes("no such table")) {
        this._workflowByCollection.set(cacheKey, {
          value: null,
          exp: Date.now() + WorkflowService.WORKFLOW_CACHE_TTL_MS,
        });
        return null;
      }
      throw err;
    }
  }

  /** Ensure states/transitions are arrays after SQL TEXT/JSON round-trip. */
  private normalizeDefinition(raw: any): WorkflowDefinition {
    const parseArr = (v: unknown): any[] => {
      if (Array.isArray(v)) return v;
      let curr = v;
      while (typeof curr === "string" && curr.trim()) {
        try {
          curr = JSON.parse(curr);
          if (Array.isArray(curr)) return curr;
        } catch {
          break;
        }
      }
      return Array.isArray(curr) ? curr : [];
    };
    const id = String(raw?._id || raw?.id || "");
    return {
      ...raw,
      _id: id,
      id,
      name: raw?.name || raw?.collectionId || "Untitled Workflow",
      // SQL engines store the flag as 0/1 (sqlite) or BOOLEAN — coerce both.
      gatePublication: raw?.gatePublication === true || raw?.gatePublication === 1,
      states: parseArr(raw?.states),
      transitions: parseArr(raw?.transitions),
    } as WorkflowDefinition;
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
      if (err.message.includes("no such table")) return null;
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
    assigneeId?: string,
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

    // 4. RBAC Check (Enterprise Grade) — admins/super-admins keep an explicit
    // override, mirroring the assignee-lock and publication-gate semantics.
    if (transition.requiredRole && !isAdminActor(user)) {
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

    const actorIsAdmin = isAdminActor(user);
    const currentStateDef = workflow.states.find((s) => s.id === instance!.currentState);
    const targetStateDef = workflow.states.find((s) => s.id === targetStateId);

    // 4b. Assignee lock: an entry assigned to a reviewer may only be advanced
    // by that reviewer (admins keep an explicit override).
    if (currentStateDef?.requiresAssignee && instance!.assigneeId && !actorIsAdmin) {
      if (String(instance!.assigneeId) !== String(user._id)) {
        throw new AppError(
          `State "${currentStateDef.label}" is assigned to another reviewer`,
          403,
          "ASSIGNEE_ONLY",
        );
      }
    }

    // 4c. Assignment bookkeeping: set when entering a state (or pre-assign
    // explicitly), clear automatically when moving into a state that does not
    // require an assignee.
    if (assigneeId) {
      instance!.assigneeId = assigneeId;
    } else if (!targetStateDef?.requiresAssignee) {
      delete instance!.assigneeId;
    }
    if (targetStateDef?.requiresAssignee && !instance!.assigneeId && !actorIsAdmin) {
      throw new AppError(
        `State "${targetStateDef.label}" requires an assigned reviewer`,
        400,
        "ASSIGNEE_REQUIRED",
      );
    }

    // 5. Update state
    const oldState = instance!.currentState;
    instance!.currentState = targetStateId;
    instance!.history.push({
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
        collectionId: instance!.collectionId,
        entryId,
        comment: comment || "",
        assigneeId: instance!.assigneeId || "",
      },
      targetType: "workflow_instance",
      targetId: entryId as DatabaseId,
      tenantId: tenantId as DatabaseId,
    });

    // 7. Side-effect hook: automation flows can react to workflow transitions
    // (webhook/email/set-field operations) without a dedicated action engine.
    eventBus.emit("workflow:transitioned", {
      tenantId: String(tenantId || "global"),
      collection: instance!.collectionId,
      entryId,
      user: { _id: user._id, email: user.email },
      data: { fromState: oldState, toState: targetStateId },
    });

    return instance!;
  }

  /**
   * Assigns (or reassigns) a reviewer to an entry's workflow instance.
   *
   * Authorized actors: admins/super-admins, or the currently assigned reviewer
   * handing the entry over. Assignment is the handshake for `requiresAssignee`
   * states; entries in such a state can only be advanced by their assignee.
   */
  public async assign(
    entryId: string,
    assigneeId: string,
    user: User,
    tenantId?: string,
  ): Promise<WorkflowInstance> {
    if (!assigneeId) {
      throw new AppError("assigneeId is required", 400, "ASSIGNEE_REQUIRED");
    }
    const instance = await this.getWorkflowInstance(entryId, tenantId);
    if (!instance) {
      throw new AppError(
        "Workflow instance not found for entry. It must be initialized first.",
        404,
        "NOT_FOUND",
      );
    }
    if (
      !isAdminActor(user) &&
      !(instance.assigneeId && String(instance.assigneeId) === String(user._id))
    ) {
      throw new AppError(
        "Only admins or the current assignee can reassign a workflow entry",
        403,
        "FORBIDDEN",
      );
    }

    const previousAssignee = instance.assigneeId;
    instance.assigneeId = assigneeId;
    const dbAdapter = await getDbAdapter();
    await dbAdapter.crud.update(
      this.INSTANCES_COLLECTION,
      instance._id as DatabaseId,
      instance as any,
      { tenantId: tenantId as DatabaseId },
    );

    await auditLogService.logEvent({
      eventType: AuditEventType.WORKFLOW_TRANSITION,
      action: `Workflow assignment: ${previousAssignee || "unassigned"} → ${assigneeId}`,
      actorId: user._id as DatabaseId,
      actorEmail: user.email,
      severity: "low",
      result: "success",
      details: {
        collectionId: instance.collectionId,
        entryId,
        fromAssignee: previousAssignee || "",
        assigneeId,
      },
      targetType: "workflow_instance",
      targetId: entryId as DatabaseId,
      tenantId: tenantId as DatabaseId,
    });

    return instance;
  }

  /**
   * Publication gate ("approval before publish").
   *
   * When the collection's workflow has `gatePublication` enabled, entries may
   * only be written with status "publish" while their workflow instance is in
   * a FINAL state. Admins/super-admins keep an explicit override; system
   * actors (scheduled publishing, sync, imports) bypass the gate by calling
   * the write path with `system: true`.
   *
   * @param entryId - existing entry (update path); omit for create-path checks
   *   (a brand-new entry has no instance yet and therefore cannot be published
   *   directly while the gate is on)
   */
  public async assertPublishAllowed(
    collectionId: string,
    tenantId: string | undefined,
    user: User,
    entryId?: string,
  ): Promise<void> {
    if (isAdminActor(user)) return;

    const workflow = await this.getWorkflowForCollection(collectionId, tenantId);
    if (!workflow || workflow.gatePublication !== true) return;

    if (!entryId) {
      throw new AppError(
        "Content in this collection must pass its review workflow before it can be published",
        403,
        "WORKFLOW_PUBLISH_GATE",
      );
    }

    const instance = await this.getWorkflowInstance(entryId, tenantId);
    const stateId = instance?.currentState ?? "";
    const stateDef = workflow.states.find((s) => s.id === stateId);
    if (!instance) {
      // Entry predates the workflow (or was never enrolled): enroll it lazily so
      // reviewers can advance it instead of leaving the entry permanently stuck.
      const enrolled = await this.initializeWorkflow(entryId, workflow.collectionId, tenantId);
      throw new AppError(
        `Content was enrolled into the "${workflow.name}" workflow and must reach a final state before it can be published (current: ${
          enrolled?.currentState
            ? (workflow.states.find((s) => s.id === enrolled!.currentState)?.label ??
              enrolled!.currentState)
            : "none"
        })`,
        403,
        "WORKFLOW_PUBLISH_GATE",
      );
    }
    if (!stateDef?.isFinal) {
      throw new AppError(
        `Content cannot be published until its workflow reaches a final state (current: ${
          stateDef?.label ?? "unknown state"
        })`,
        403,
        "WORKFLOW_PUBLISH_GATE",
      );
    }
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

export const workflowService = new WorkflowService();
