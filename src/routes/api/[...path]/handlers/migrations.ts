/**
 * @file src/routes/api/[...path]/handlers/migrations.ts
 * @description Data migration handler — handles `/api/migrations/*` routes.
 *
 * Migrations transform stored data or schema state in place with plan-first
 * workflow, cross-adapter locking, idempotent operations, and audit integration.
 *
 * ### Features:
 * - Versioned, checksummed migration ledger
 * - Plan-first with risk-scoring and destructive-change gating
 * - Cross-adapter migration lock (PostgreSQL, MariaDB, SQLite, MongoDB)
 * - Postcondition verification against actual DB state
 * - Integration with Collection Builder migration checks
 * - Idempotent apply via planHash deduplication
 * - In-memory plan store for planId-based apply workflow
 */

import { AppError } from "@utils/error-handling";
import { type RequestEvent } from "@sveltejs/kit";
import { successResponse, errorResponse } from "./base";
import type { DatabaseId } from "@src/content/types";
import type { MigrationPlan } from "@src/services/core/migration-engine";
import type { LocalCMS } from "@src/services/sdk";

/**
 * Ephemeral in-memory store for migration plans keyed by planId.
 * Plans are auto-cleaned after 30 minutes to prevent memory leaks.
 */
const planStore = new Map<string, MigrationPlan>();

/** Cleanup timeout in milliseconds. */
const PLAN_TTL_MS = 30 * 60 * 1000;

/**
 * Resolves a code schema either from the request body or by looking up
 * a collection by name in the content store.
 */
async function resolveCodeSchema(body: Record<string, any>, collectionName?: string): Promise<any> {
  if (body.codeSchema) return body.codeSchema;

  const name = collectionName || body.collectionName;
  if (!name) {
    throw new AppError("collectionName is required when codeSchema is not provided", 400);
  }

  const { contentStore } = await import("@stores/content-registry.svelte");
  const schema = contentStore.getCollection(name);
  if (!schema) {
    throw new AppError(`Collection "${name}" not found`, 404);
  }
  return schema;
}

/**
 * Handle data migration routes under `/api/migrations/*`.
 */
export async function handleMigrationRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url } = event;
  const action = segments[1];

  // ── GET /api/migrations/status?collectionId=xyz ──────────────────────────
  if (action === "status" && request.method === "GET") {
    const { MigrationEngine } = await import("@src/services/core/migration-engine");
    const collectionId = url.searchParams.get("collectionId") || undefined;
    const status = await MigrationEngine.getStatus(collectionId);
    return successResponse(event, status);
  }

  // ── GET /api/migrations/history?collectionId=xyz ─────────────────────────
  if (action === "history" && request.method === "GET") {
    const { MigrationEngine } = await import("@src/services/core/migration-engine");
    const collectionId = url.searchParams.get("collectionId") || undefined;
    const history = await MigrationEngine.getHistory(collectionId);
    return successResponse(event, history);
  }

  // ── POST /api/migrations/plan ────────────────────────────────────────────
  if (action === "plan" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { MigrationEngine } = await import("@src/services/core/migration-engine");

    const codeSchema = await resolveCodeSchema(body);
    const plan = await MigrationEngine.createPlan(codeSchema);

    // Store plan for later apply/verify via planId
    planStore.set(plan.planId, plan);
    setTimeout(() => planStore.delete(plan.planId), PLAN_TTL_MS);

    return successResponse(event, plan);
  }

  // ── POST /api/migrations/apply ───────────────────────────────────────────
  if (action === "apply" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { MigrationEngine } = await import("@src/services/core/migration-engine");

    // Resolve plan: from body.plan directly, or from planStore by planId
    let plan: MigrationPlan | undefined = body.plan as MigrationPlan | undefined;
    if (!plan && body.planId) {
      plan = planStore.get(body.planId);
      if (!plan) {
        throw new AppError(
          `Plan "${body.planId}" not found. It may have expired — create a new plan first.`,
          404,
        );
      }
    }
    if (!plan) {
      throw new AppError("Either `plan` or `planId` is required", 400);
    }

    // Resolve code schema for the plan's target collection
    const codeSchema =
      (body.codeSchema as any) || (await resolveCodeSchema(body, plan.collectionId));

    const appliedBy =
      (event.locals as any).user?._id ||
      (event.locals as any).user?.id ||
      (event.locals as any).user?.email;

    const result = await MigrationEngine.applyMigration(plan, codeSchema, {
      confirmed: body.confirmed === true,
      appliedBy,
    });

    if (!result.success) {
      // Destructive plans without explicit confirmation
      if (result.message?.includes("requires explicit confirmation")) {
        return errorResponse(event, result.message, 400, "CONFIRMATION_REQUIRED");
      }
      // Migration lock held by another instance
      if (
        result.message?.includes("Another migration is in progress") ||
        result.message?.includes("Could not acquire migration lock")
      ) {
        return errorResponse(event, result.message, 409, "LOCK_CONFLICT");
      }
      return errorResponse(event, result.message, 400);
    }

    // Clean up plan store after successful apply
    planStore.delete(plan.planId);

    return successResponse(event, result);
  }

  // ── POST /api/migrations/verify ──────────────────────────────────────────
  if (action === "verify" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));

    if (!body.planId) {
      throw new AppError("planId is required for verification", 400);
    }

    const { MigrationEngine } = await import("@src/services/core/migration-engine");

    // Resolve code schema — required for re-running the schema comparison
    const codeSchema = await resolveCodeSchema(body);
    const result = await MigrationEngine.verifyMigration(codeSchema, body.planId);

    return successResponse(event, result);
  }

  throw new AppError(
    `Migration action "${action || "(none)"}" with method ${request.method} is not implemented`,
    404,
  );
}
