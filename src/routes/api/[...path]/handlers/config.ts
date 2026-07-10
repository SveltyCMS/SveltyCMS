/**
 * @file src/routes/api/[...path]/handlers/config.ts
 * @description Configuration promotion handler — handles `/api/config/*` routes.
 *
 * Manages environment configuration promotion: export, plan, apply, status,
 * and resource listing. Uses ConfigService for backend logic and enforces
 * plan-first workflow with audit logging.
 *
 * ### Features:
 * - Deterministic config export with checksums
 * - Plan-first promotion with drift detection
 * - Cross-tenant isolation
 * - Audit log integration
 * - Deprecation-aware (handles legacy /api/config_sync alias)
 */

// In-memory plan store for plan-first apply validation
const planStore = new Map<string, { plan: any; createdAt: number }>();
const PLAN_STORE_TTL = 30 * 60 * 1000; // 30 minutes

import { AppError } from "@utils/error-handling";
import { type RequestEvent } from "@sveltejs/kit";
import { successResponse } from "./base";
import type { DatabaseId } from "@src/content/types";
import type { LocalCMS } from "@src/services/sdk";

/**
 * Handle configuration promotion routes under `/api/config/*`.
 */
export async function handleConfigRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request } = event;

  const action = segments[1]; // e.g., "resources", "status", "export", "plan", "apply", "history"

  // ── Legacy /api/config_sync compatibility (no sub-action) ───────────────
  if (!action && request.method === "GET") {
    const { configService } = await import("@src/services/core/config-service");
    const status = await configService.getStatus(tenantId as string);
    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { "Content-Type": "application/json", Deprecation: "true" },
    });
  }

  if (!action && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (body?.action !== "import") {
      throw new AppError(
        "Unknown legacy config_sync action. Use POST /api/config/plan followed by POST /api/config/apply.",
        400,
        "DEPRECATED_ACTION",
      );
    }

    const { configService } = await import("@src/services/core/config-service");
    await configService.performImport({ tenantId: tenantId as string });

    return new Response(
      JSON.stringify({
        success: true,
        message:
          "Configuration imported successfully. This endpoint is deprecated; use /api/config/plan and /api/config/apply.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", Deprecation: "true" },
      },
    );
  }

  // ── GET /api/config/resources ──────────────────────────────────────────
  if (action === "resources" && request.method === "GET") {
    return successResponse(event, {
      resources: [
        {
          type: "collections",
          supported: true,
          description: "Collection schemas and field definitions",
        },
        { type: "roles", supported: true, description: "Role definitions and permissions" },
        { type: "settings", supported: true, description: "Non-secret system settings" },
        { type: "widgets", supported: true, description: "Widget active state" },
        { type: "themes", supported: true, description: "Active theme configuration" },
        { type: "webhooks", supported: true, description: "Webhook definitions" },
        { type: "automations", supported: true, description: "Automation workflow definitions" },
        { type: "workflows", supported: true, description: "Content workflow definitions" },
      ],
      excluded: [
        "users",
        "sessions",
        "api-tokens",
        "secrets",
        "content-entries",
        "media-binaries",
        "audit-logs",
        "job-queue-state",
      ],
    });
  }

  // ── GET /api/config/status ─────────────────────────────────────────────
  if (action === "status" && request.method === "GET") {
    const { configService } = await import("@src/services/core/config-service");
    const status = await configService.getStatus(tenantId as string);
    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── POST /api/config/export ────────────────────────────────────────────
  if (action === "export" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { configService } = await import("@src/services/core/config-service");
    const result = await configService.performExport({
      uuids: body.uuids,
      tenantId: tenantId as string,
    });
    return successResponse(event, {
      success: true,
      dirPath: result.dirPath,
      message: "Configuration exported successfully.",
    });
  }

  // ── POST /api/config/plan ──────────────────────────────────────────────
  if (action === "plan" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { configService } = await import("@src/services/core/config-service");
    const status = await configService.getStatus(tenantId as string);

    // Build a plan from detected changes
    const plan = {
      planId: crypto.randomUUID(),
      operationType: "config-promotion" as const,
      mode: (body.mode as string) || "merge",
      risk: "safe",
      operations: [] as Array<{ action: string; type: string; name: string; uuid: string }>,
      warnings: [] as string[],
      blockedReasons: [] as string[],
      requiresConfirmation: false,
    };

    for (const item of status.changes.new) {
      plan.operations.push({ action: "create", type: item.type, name: item.name, uuid: item.uuid });
    }
    for (const item of status.changes.updated) {
      plan.operations.push({ action: "update", type: item.type, name: item.name, uuid: item.uuid });
    }
    for (const item of status.changes.deleted) {
      if (body.mode === "mirror" || body.mode === "replace") {
        plan.operations.push({
          action: "delete",
          type: item.type,
          name: item.name,
          uuid: item.uuid,
        });
        plan.risk = "destructive";
        plan.requiresConfirmation = true;
      } else {
        plan.warnings.push(
          `Resource "${item.name}" (${item.type}) exists in DB but not in source. Use "mirror" mode to delete.`,
        );
      }
    }

    if (status.unmetRequirements.length > 0) {
      for (const req of status.unmetRequirements) {
        plan.blockedReasons.push(`Missing required setting: ${req.key}`);
      }
    }

    // Store plan for later apply verification
    planStore.set(plan.planId, { plan, createdAt: Date.now() });

    // Emit webhook event (best-effort, non-blocking)
    try {
      const { eventBus } = await import("@src/services/background/automation/event-bus");
      eventBus.emit("config.plan.created", {
        tenantId: tenantId as string,
        data: {
          planId: plan.planId,
          mode: plan.mode,
          risk: plan.risk,
          operations: plan.operations.length,
        },
      });
    } catch {
      /* event emission is best-effort */
    }

    return successResponse(event, plan);
  }

  // ── POST /api/config/apply ─────────────────────────────────────────────
  if (action === "apply" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));

    if (!body.planId) {
      throw new AppError("planId is required to apply a configuration plan", 400);
    }

    // Verify plan exists and hasn't expired
    const stored = planStore.get(body.planId);
    if (!stored) {
      throw new AppError(
        "Plan not found or expired. Create a new plan before applying.",
        400,
        "PLAN_NOT_FOUND",
      );
    }
    if (Date.now() - stored.createdAt > PLAN_STORE_TTL) {
      planStore.delete(body.planId);
      throw new AppError(
        "Plan has expired. Create a new plan before applying.",
        400,
        "PLAN_EXPIRED",
      );
    }

    // Verify destructive operations are confirmed
    if (stored.plan.requiresConfirmation && !body.confirmed) {
      throw new AppError(
        "This plan contains destructive operations. Set confirmed: true to proceed.",
        400,
        "CONFIRMATION_REQUIRED",
      );
    }

    const { configService } = await import("@src/services/core/config-service");

    // Re-check status before applying (target may have changed)
    const currentStatus = await configService.getStatus(tenantId as string);
    if (currentStatus.status === "in_sync" && stored.plan.operations.length > 0) {
      // Target changed since plan was created — warn but allow if confirmed
      if (!body.confirmed) {
        throw new AppError(
          "Configuration has changed since the plan was created. Set confirmed: true to proceed.",
          400,
          "TARGET_CHANGED",
        );
      }
    }

    await configService.performImport({ tenantId: tenantId as string });

    // Clean up stored plan
    planStore.delete(body.planId);

    return successResponse(event, {
      success: true,
      message: "Configuration applied successfully.",
      appliedAt: new Date().toISOString(),
      operationsApplied: stored.plan.operations.length,
    });
  }

  // ── GET /api/config/history ────────────────────────────────────────────
  if (action === "history" && request.method === "GET") {
    // TODO: Persist and retrieve operation history from audit logs
    return successResponse(event, {
      history: [],
      message: "Operation history is not yet persisted.",
    });
  }

  throw new AppError(
    `Config action "${action || "(none)"}" with method ${request.method} is not implemented`,
    404,
  );
}
