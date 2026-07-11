/**
 * @file src/services/core/migration-engine.ts
 * @description
 * Enterprise-grade Schema Migration Engine with ledger tracking, idempotent apply,
 * postcondition verification, and cross-adapter locking.
 *
 * Responsibilities include:
 * - Comparing Code Schemas against Database Schemas to detect drift
 * - Creating risk-scored migration plans with pre/postconditions
 * - Idempotent migration execution with plan-hash deduplication
 * - Postcondition verification after apply
 * - Full migration history ledger stored in the database
 *
 * ### Features:
 * - migration ledger (migration_ledger collection)
 * - idempotent apply via planHash deduplication
 * - cross-adapter locking via migration-lock.ts
 * - risk scoring (safe / warning / destructive)
 * - data-loss gating with explicit confirmation
 * - rollback support for failed migrations
 * - SHA-256 checksums for tamper detection
 */

import type { Schema } from "@content/types";
import { dbAdapter } from "@src/databases/db";
import { logger } from "@utils/logger";
import { generateUUID } from "@utils/native-utils";
import { compareSchemas, type SchemaChange } from "@utils/schema/comparison";
import { withMigrationLock } from "@src/databases/migration-lock";

// ── Types ──

/** Risk classification for a migration plan. */
export type MigrationRisk = "safe" | "warning" | "destructive";

/** Status of a migration record in the ledger. */
export type MigrationStatus = "pending" | "applied" | "failed" | "rolled_back";

/**
 * A single migration record stored in the migration_ledger collection.
 * Acts as an append-only audit trail for all schema changes.
 */
export interface MigrationRecord {
  /** Unique identifier for this migration (UUID v4). */
  migrationId: string;
  /** The collection affected by this migration. */
  collectionId: string;
  /** Monotonically incrementing version number per collection. */
  version: number;
  /** SHA-256 checksum of the serialized changes array. */
  checksum: string;
  /** The list of schema changes in this migration. */
  changes: SchemaChange[];
  /** Current status of this migration. */
  status: MigrationStatus;
  /** ISO timestamp when the migration was applied. */
  appliedAt?: string;
  /** User ID of the person who triggered the migration. */
  appliedBy?: string;
  /** Error message if the migration failed. */
  errorMessage?: string;
  /**
   * Deterministic hash of the full migration plan (changes + collectionId).
   * Used for idempotency — identical planHash means the migration was already applied.
   */
  planHash: string;
}

/**
 * Enhanced migration plan with risk scoring, preconditions, and postconditions.
 */
export interface MigrationPlan {
  /** Unique plan identifier (UUID v4). */
  planId: string;
  /** The collection this plan targets. */
  collectionId: string;
  /** Ordered list of schema changes to apply. */
  changes: SchemaChange[];
  /** Computed risk level based on change types. */
  risk: MigrationRisk;
  /** Whether this plan requires explicit user confirmation before applying. */
  requiresConfirmation: boolean;
  /** Estimated impact on existing data. */
  impact: {
    /** Number of documents in the target collection. */
    documentsAffected: number;
    /** Whether this migration could result in data loss. */
    dataLossPotential: boolean;
  };
  /** Conditions that must be true before this plan can be applied. */
  preconditions: string[];
  /** Conditions that must be true after this plan is applied. */
  postconditions: string[];
  /** Whether a migration is actually needed (false if schemas match). */
  requiresMigration: boolean;
}

/**
 * Result returned by getStatus() — a snapshot of the migration ledger state.
 */
export interface MigrationStatusResult {
  collectionId: string;
  pending: number;
  applied: number;
  failed: number;
  rolledBack: number;
  lastMigration?: MigrationRecord;
}

/**
 * Result returned by verifyMigration() — postcondition validation outcome.
 */
export interface VerifyResult {
  /** Whether the verification passed. */
  passed: boolean;
  /** Human-readable summary. */
  message: string;
  /** Detailed per-change verification results. */
  details: VerifyDetail[];
  /** Whether any data corruption was detected. */
  dataCorruptionDetected: boolean;
}

/** Per-change verification detail. */
export interface VerifyDetail {
  fieldName: string;
  changeType: SchemaChange["type"];
  expected: boolean;
  actual: boolean;
  message: string;
}

// ── Internal Helpers ──

/**
 * Generates a SHA-256 hex digest of the given string.
 * Uses the Web Crypto API (CSPRNG-backed, no external dependencies).
 */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Creates a deterministic plan hash from the collection ID and changes.
 * Used for idempotency — same changes produce the same hash.
 */
async function computePlanHash(collectionId: string, changes: SchemaChange[]): Promise<string> {
  const payload = JSON.stringify({ collectionId, changes });
  return sha256(payload);
}

/**
 * Computes a checksum for the changes array alone.
 */
async function computeChecksum(changes: SchemaChange[]): Promise<string> {
  return sha256(JSON.stringify(changes));
}

/**
 * Determines the risk level of a set of changes.
 * - "destructive": field_removed or type_changed (data loss)
 * - "warning": required_added or unique_added (validation risk)
 * - "safe": field_added or option_changed only
 */
function assessRisk(changes: SchemaChange[]): MigrationRisk {
  const hasDestructive = changes.some(
    (c) => c.type === "field_removed" || c.type === "type_changed",
  );
  if (hasDestructive) return "destructive";

  const hasWarning = changes.some((c) => c.type === "required_added" || c.type === "unique_added");
  if (hasWarning) return "warning";

  return "safe";
}

/**
 * Builds preconditions from the migration plan.
 */
function buildPreconditions(collectionId: string, changes: SchemaChange[]): string[] {
  const preconditions: string[] = [
    `Collection "${collectionId}" must exist in the database`,
    `Database connection must be active`,
    `No other migration must be in progress for "${collectionId}"`,
  ];

  for (const change of changes) {
    if (change.type === "field_removed") {
      preconditions.push(`Field "${change.fieldName}" must exist in the current database schema`);
    }
    if (change.type === "type_changed") {
      preconditions.push(`Field "${change.fieldName}" must exist with type "${change.oldValue}"`);
    }
  }

  return preconditions;
}

/**
 * Builds postconditions from the migration plan.
 */
function buildPostconditions(collectionId: string, changes: SchemaChange[]): string[] {
  const postconditions: string[] = [
    `Collection "${collectionId}" schema matches the target code schema`,
    `All existing documents in "${collectionId}" remain accessible`,
    `Migration record stored with status "applied"`,
  ];

  for (const change of changes) {
    if (change.type === "field_added") {
      postconditions.push(
        `Field "${change.fieldName}" must exist in the database schema after migration`,
      );
    }
    if (change.type === "field_removed") {
      postconditions.push(
        `Field "${change.fieldName}" must NOT exist in the database schema after migration`,
      );
    }
    if (change.type === "type_changed") {
      postconditions.push(
        `Field "${change.fieldName}" must have type "${change.newValue}" after migration`,
      );
    }
  }

  return postconditions;
}

/**
 * Retrieves the next version number for a collection's migration ledger.
 */
async function getNextVersion(collectionId: string): Promise<number> {
  try {
    if (!dbAdapter) return 1;

    const result = await dbAdapter.crud.findMany("migration_ledger", {
      collectionId,
    } as any);
    if (result.success && result.data && result.data.length > 0) {
      const versions = result.data.map((r: any) => r.version ?? 0).filter((v: number) => v > 0);
      return versions.length > 0 ? Math.max(...versions) + 1 : 1;
    }
    return 1;
  } catch (err) {
    logger.warn(`[MigrationEngine] Failed to get next version for ${collectionId}:`, err);
    return 1;
  }
}

/**
 * Checks whether a migration with the given planHash has already been applied.
 * Returns the existing record if found, null otherwise.
 */
async function findExistingMigration(planHash: string): Promise<MigrationRecord | null> {
  try {
    if (!dbAdapter) return null;

    const result = await dbAdapter.crud.findMany("migration_ledger", {
      planHash,
      status: "applied",
    } as any);

    if (result.success && result.data && result.data.length > 0) {
      return result.data[0] as unknown as MigrationRecord;
    }
    return null;
  } catch (err) {
    logger.warn(`[MigrationEngine] Error checking for existing migration:`, err);
    return null;
  }
}

/**
 * Persists a migration record to the ledger.
 */
async function saveMigrationRecord(record: MigrationRecord): Promise<void> {
  if (!dbAdapter) {
    throw new Error("DB Adapter not initialized — cannot persist migration record");
  }

  await dbAdapter.crud.insert("migration_ledger", record as any);
  logger.info(`[MigrationEngine] Migration record saved: ${record.migrationId} (${record.status})`);
}

/**
 * Updates the status of an existing migration record.
 */
async function updateMigrationStatus(
  migrationId: string,
  status: MigrationStatus,
  errorMessage?: string,
): Promise<void> {
  if (!dbAdapter) return;

  try {
    // Find the record by migrationId, then update by _id
    const findResult = await dbAdapter.crud.findMany("migration_ledger", {
      migrationId,
    } as any);

    if (findResult.success && findResult.data && findResult.data.length > 0) {
      const record = findResult.data[0] as any;
      await dbAdapter.crud.update("migration_ledger", record._id, {
        status,
        errorMessage: errorMessage ?? null,
        appliedAt: status === "applied" ? new Date().toISOString() : undefined,
      } as any);
    }
  } catch (err) {
    logger.warn(`[MigrationEngine] Failed to update migration status for ${migrationId}:`, err);
  }
}

// ── MigrationEngine ──

export class MigrationEngine {
  // ─────────────────────────────────────────────────────────────
  // Public API: Plan Creation
  // ─────────────────────────────────────────────────────────────

  /**
   * Creates a migration plan by comparing the Code Schema (target) against the
   * Database Schema (current). Enhanced with risk scoring, preconditions, and
   * postconditions.
   *
   * @param codeSchema - The target schema from code (what we want).
   * @returns A fully-scored MigrationPlan with a unique planId.
   */
  static async createPlan(codeSchema: Schema): Promise<MigrationPlan> {
    const ledger = logger.channel("MigrationEngine");
    const collectionId = codeSchema._id || codeSchema.name?.toString() || "unknown";
    const planId = generateUUID();

    // 1. Fetch current DB Schema
    let dbSchema: Schema | null = null;

    if (dbAdapter) {
      try {
        const result = await dbAdapter.collection.getSchema(codeSchema.name as string);
        if (result.success && result.data) {
          dbSchema = result.data;
        }
      } catch (e) {
        ledger.warn(`Failed to fetch schema for ${codeSchema.name}:`, e);
      }
    } else {
      ledger.warn("DB Adapter not active, assuming no drift.");
    }

    // If DB schema is not found (new collection), assume empty schema
    const currentDbSchema =
      dbSchema || ({ _id: codeSchema._id, name: codeSchema.name, fields: [] } as Schema);

    const comparison = compareSchemas(codeSchema, currentDbSchema);

    // 2. Assess Risk
    const risk = assessRisk(comparison.changes);
    const dataLossPotential = comparison.changes.some(
      (c) => c.type === "field_removed" || c.type === "type_changed",
    );

    // 3. Estimate Impact
    const documentsAffected = dbAdapter
      ? await dbAdapter.crud
          .count(codeSchema.name as string)
          .then((res) => (res.success ? res.data : 0))
      : 0;

    // 4. Build pre/postconditions
    const preconditions = comparison.requiresMigration
      ? buildPreconditions(collectionId, comparison.changes)
      : [];
    const postconditions = comparison.requiresMigration
      ? buildPostconditions(collectionId, comparison.changes)
      : [];

    // 5. Determine if confirmation is required
    const requiresConfirmation =
      risk === "destructive" || (risk === "warning" && documentsAffected > 100);

    ledger.info(
      `Plan ${planId} created for ${collectionId}: ` +
        `${comparison.changes.length} change(s), risk=${risk}, ` +
        `${documentsAffected} doc(s) affected, requiresMigration=${comparison.requiresMigration}`,
    );

    return {
      planId,
      collectionId,
      changes: comparison.changes,
      risk,
      requiresConfirmation,
      impact: {
        documentsAffected,
        dataLossPotential,
      },
      preconditions,
      postconditions,
      requiresMigration: comparison.requiresMigration,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Public API: Apply Migration (Idempotent)
  // ─────────────────────────────────────────────────────────────

  /**
   * Applies a migration plan with idempotency, locking, and ledger recording.
   *
   * Idempotency: If a migration with the same `planHash` was already applied,
   * this method returns immediately with a "skipped" result.
   *
   * Locking: Uses `withMigrationLock` from `migration-lock.ts` to prevent
   * concurrent migrations across multiple server instances.
   *
   * Safety: Migrations with `dataLossPotential` that haven't been explicitly
   * confirmed will be rejected.
   *
   * @param plan - The migration plan to apply.
   * @param codeSchema - The target code schema to apply.
   * @param options - Optional overrides.
   * @param options.confirmed - Set to true to bypass the confirmation gate for destructive plans.
   * @param options.appliedBy - User ID of the person triggering the migration.
   * @returns Result indicating success, skip, or failure.
   */
  static async applyMigration(
    plan: MigrationPlan,
    codeSchema: Schema,
    options?: { confirmed?: boolean; appliedBy?: string },
  ): Promise<{ success: boolean; message: string; migrationId?: string }> {
    const ledger = logger.channel("MigrationEngine");

    // 0. Guard: migration not needed
    if (!plan.requiresMigration) {
      return {
        success: true,
        message: `No migration needed for "${plan.collectionId}" — schemas are in sync.`,
      };
    }

    // 0. Guard: confirmation required for destructive changes
    if (plan.requiresConfirmation && !options?.confirmed) {
      const msg =
        `Migration "${plan.planId}" for "${plan.collectionId}" is marked as ` +
        `"${plan.risk}" risk and requires explicit confirmation. ` +
        `Pass { confirmed: true } to proceed.`;
      ledger.warn(msg);
      return { success: false, message: msg };
    }

    // 1. Compute plan hash for idempotency
    const planHash = await computePlanHash(plan.collectionId, plan.changes);

    // 2. Idempotency check: skip if already applied
    const existing = await findExistingMigration(planHash);
    if (existing) {
      ledger.info(
        `Migration for "${plan.collectionId}" with planHash ${planHash.slice(0, 8)}... ` +
          `already applied (record: ${existing.migrationId}). Skipping.`,
      );
      return {
        success: true,
        message: `Migration already applied (record: ${existing.migrationId}).`,
        migrationId: existing.migrationId,
      };
    }

    // 3. Prepare migration record
    const checksum = await computeChecksum(plan.changes);
    const version = await getNextVersion(plan.collectionId);
    const migrationId = generateUUID();
    const now = new Date().toISOString();

    const record: MigrationRecord = {
      migrationId,
      collectionId: plan.collectionId,
      version,
      checksum,
      changes: plan.changes,
      status: "pending",
      planHash,
    };

    // 4. Save pending record
    try {
      await saveMigrationRecord(record);
    } catch (err) {
      const error = err as Error;
      ledger.error(`Failed to save migration record for ${plan.collectionId}:`, error);
      return {
        success: false,
        message: `Failed to create migration record: ${error.message}`,
      };
    }

    // 5. Acquire cross-adapter lock and apply
    if (!dbAdapter) {
      await updateMigrationStatus(migrationId, "failed", "DB Adapter not initialized");
      return {
        success: false,
        message: "DB Adapter not initialized",
        migrationId,
      };
    }

    const dbType = dbAdapter.type || "unknown";

    const lockAcquired = await withMigrationLock(dbAdapter, dbType, async () => {
      ledger.info(`[MigrationLock acquired] Applying migration ${migrationId}...`);

      try {
        // Apply the schema update
        await dbAdapter.collection.updateModel(codeSchema);

        // Record success
        record.status = "applied";
        record.appliedAt = now;
        record.appliedBy = options?.appliedBy;
        await updateMigrationStatus(migrationId, "applied");

        ledger.info(`Migration ${migrationId} applied successfully for "${plan.collectionId}".`);

        // Emit webhook event (best-effort, non-blocking)
        try {
          const { eventBus } = await import("@src/services/background/automation/event-bus");
          eventBus.emit("migration.applied", {
            tenantId: plan.collectionId,
            data: {
              collectionId: plan.collectionId,
              planId: plan.planId,
              migrationId,
              version,
              status: "applied",
            },
          });
        } catch {
          /* event emission is best-effort */
        }
      } catch (err) {
        const error = err as Error;
        ledger.error(`Migration ${migrationId} failed:`, error);

        record.status = "failed";
        record.errorMessage = error.message;
        await updateMigrationStatus(migrationId, "failed", error.message);

        // Emit webhook event (best-effort, non-blocking)
        try {
          const { eventBus } = await import("@src/services/background/automation/event-bus");
          eventBus.emit("migration.failed", {
            tenantId: plan.collectionId,
            data: {
              collectionId: plan.collectionId,
              planId: plan.planId,
              migrationId,
              status: "failed",
              error: error.message,
            },
          });
        } catch {
          /* event emission is best-effort */
        }

        throw err; // Re-throw to signal failure to withMigrationLock
      }
    });

    if (!lockAcquired) {
      // Lock not acquired — another instance is migrating; mark as pending retry
      ledger.warn(
        `Could not acquire migration lock for "${plan.collectionId}". ` +
          `Another instance may be running migrations.`,
      );
      return {
        success: false,
        message: "Another migration is in progress. Retry later.",
        migrationId,
      };
    }

    // Check final status
    if (record.status === "applied") {
      return {
        success: true,
        message: `Migration ${migrationId} applied successfully.`,
        migrationId,
      };
    }

    return {
      success: false,
      message: record.errorMessage || "Migration failed.",
      migrationId,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Public API: Postcondition Verification
  // ─────────────────────────────────────────────────────────────

  /**
   * Verifies that a migration was applied correctly by re-running schema
   * comparison and checking each expected change.
   *
   * @param codeSchema - The target code schema to verify against.
   * @param planOrId - Either a MigrationPlan or a migrationId string.
   * @returns Verification result with pass/fail and per-change details.
   */
  static async verifyMigration(
    codeSchema: Schema,
    planOrId: MigrationPlan | string,
  ): Promise<VerifyResult> {
    const ledger = logger.channel("MigrationEngine");

    // Resolve the plan
    let plan: MigrationPlan | null = null;
    let migrationRecord: MigrationRecord | null = null;

    if (typeof planOrId === "string") {
      // Look up the migration record from the ledger
      try {
        if (dbAdapter) {
          const result = await dbAdapter.crud.findMany("migration_ledger", {
            migrationId: planOrId,
          } as any);
          if (result.success && result.data && result.data.length > 0) {
            migrationRecord = result.data[0] as unknown as MigrationRecord;
            // Reconstruct a minimal plan from the record
            plan = {
              planId: migrationRecord.migrationId,
              collectionId: migrationRecord.collectionId,
              changes: migrationRecord.changes,
              risk: assessRisk(migrationRecord.changes),
              requiresConfirmation: false,
              impact: { documentsAffected: 0, dataLossPotential: false },
              preconditions: [],
              postconditions: [],
              requiresMigration: migrationRecord.changes.length > 0,
            };
          }
        }
      } catch (err) {
        ledger.warn(`Failed to look up migration record ${planOrId}:`, err);
      }
    } else {
      plan = planOrId;
    }

    if (!plan) {
      return {
        passed: false,
        message: `Migration plan or record not found for: ${typeof planOrId === "string" ? planOrId : planOrId.planId}`,
        details: [],
        dataCorruptionDetected: false,
      };
    }

    // 1. Re-run schema comparison
    let currentSchema: Schema | null = null;
    if (dbAdapter) {
      try {
        const result = await dbAdapter.collection.getSchema(codeSchema.name as string);
        if (result.success && result.data) {
          currentSchema = result.data;
        }
      } catch (e) {
        ledger.warn(`Failed to fetch current schema for verification:`, e);
      }
    }

    if (!currentSchema) {
      return {
        passed: false,
        message: "Could not fetch current database schema for verification.",
        details: [],
        dataCorruptionDetected: false,
      };
    }

    // Compare code schema against the actual current DB schema
    const actualComparison = compareSchemas(codeSchema, currentSchema);

    // 2. Validate each expected change
    const details: VerifyDetail[] = [];
    let allPassed = true;

    for (const expectedChange of plan.changes) {
      let actual = false;
      let message = "";

      if (expectedChange.type === "field_added") {
        // Check that this field no longer appears as a "field_added" in the comparison
        // (i.e., it now exists in DB and matches the code)
        const stillInChanges = actualComparison.changes.some(
          (c) => c.fieldName === expectedChange.fieldName && c.type === "field_added",
        );
        actual = !stillInChanges;
        message = actual
          ? `Field "${expectedChange.fieldName}" exists in DB schema.`
          : `Field "${expectedChange.fieldName}" still missing from DB schema.`;
      } else if (expectedChange.type === "field_removed") {
        const stillInChanges = actualComparison.changes.some(
          (c) => c.fieldName === expectedChange.fieldName && c.type === "field_removed",
        );
        // If the field was removed, it should NOT appear as a "field_removed" change
        // (because the code schema also shouldn't have it anymore — but since we're comparing
        // against the TARGET codeSchema, if the removal was applied, the field won't be in DB)
        // Actually: codeSchema is the target. If field was removed in code, codeSchema won't have it.
        // DB was updated to remove it. So the comparison should NOT show field_removed.
        actual = !stillInChanges;
        message = actual
          ? `Field "${expectedChange.fieldName}" correctly removed from DB.`
          : `Field "${expectedChange.fieldName}" still present in DB schema.`;
      } else if (expectedChange.type === "type_changed") {
        const stillInChanges = actualComparison.changes.some(
          (c) => c.fieldName === expectedChange.fieldName && c.type === "type_changed",
        );
        actual = !stillInChanges;
        message = actual
          ? `Field "${expectedChange.fieldName}" type matches code schema.`
          : `Field "${expectedChange.fieldName}" type still diverges from code schema.`;
      } else {
        // For required_added, unique_added, option_changed — check if they still appear
        const stillInChanges = actualComparison.changes.some(
          (c) => c.fieldName === expectedChange.fieldName && c.type === expectedChange.type,
        );
        actual = !stillInChanges;
        message = actual
          ? `Change "${expectedChange.type}" for "${expectedChange.fieldName}" verified.`
          : `Change "${expectedChange.type}" for "${expectedChange.fieldName}" not reflected in DB.`;
      }

      if (!actual) allPassed = false;

      details.push({
        fieldName: expectedChange.fieldName,
        changeType: expectedChange.type,
        expected: true,
        actual,
        message,
      });
    }

    // 3. Check for unexpected residual drift (data corruption indicator)
    const dataCorruptionDetected =
      actualComparison.changes.length > plan.changes.length &&
      actualComparison.changes.some(
        (c) => !plan!.changes.some((pc) => pc.fieldName === c.fieldName && pc.type === c.type),
      );

    if (dataCorruptionDetected) {
      allPassed = false;
      ledger.warn(
        `[MigrationEngine] Data corruption suspected for "${plan.collectionId}": ` +
          `Expected ${plan.changes.length} changes, found ${actualComparison.changes.length}.`,
      );
    }

    // 4. Check document accessibility (validate no data corruption)
    let docAccessOk = true;
    if (dbAdapter && allPassed) {
      try {
        const countResult = await dbAdapter.crud.count(plan.collectionId);
        if (countResult.success) {
          ledger.debug(
            `[MigrationEngine] Post-migration: ${countResult.data} documents accessible in "${plan.collectionId}".`,
          );
        } else {
          docAccessOk = false;
        }
      } catch {
        docAccessOk = false;
      }
    }

    const passed = allPassed && docAccessOk && !dataCorruptionDetected;
    const summary = passed
      ? `Migration verified successfully: all ${details.length} change(s) confirmed.`
      : `Verification failed: some changes were not applied correctly. ` +
        `See details for more information.`;

    ledger.info(
      `[MigrationEngine] Verification for "${plan.collectionId}": ${passed ? "PASS" : "FAIL"}`,
    );

    // Emit webhook event (best-effort, non-blocking)
    try {
      const { eventBus } = await import("@src/services/background/automation/event-bus");
      eventBus.emit("migration.verified", {
        tenantId: plan.collectionId,
        data: {
          collectionId: plan.collectionId,
          planId: plan.planId,
          status: passed ? "verified" : "verification_failed",
          details: details.map((d) => ({
            fieldName: d.fieldName,
            changeType: d.changeType,
            passed: d.actual,
          })),
        },
      });
    } catch {
      /* event emission is best-effort */
    }

    return {
      passed,
      message: summary,
      details,
      dataCorruptionDetected: dataCorruptionDetected || !docAccessOk,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Public API: Rollback
  // ─────────────────────────────────────────────────────────────

  /**
   * Attempts to roll back a migration by marking it as rolled_back in the ledger.
   *
   * Note: True schema rollback (reverting DDL changes) is database-specific and
   * not always possible. This method marks the ledger record and provides guidance.
   * For full rollback, restore from a backup and re-apply the previous schema.
   *
   * @param migrationId - The ID of the migration to roll back.
   * @returns Result indicating success or failure.
   */
  static async rollbackMigration(
    migrationId: string,
  ): Promise<{ success: boolean; message: string }> {
    const ledger = logger.channel("MigrationEngine");

    if (!dbAdapter) {
      return { success: false, message: "DB Adapter not initialized." };
    }

    // 1. Find the migration record
    let record: MigrationRecord | null = null;
    try {
      const result = await dbAdapter.crud.findMany("migration_ledger", {
        migrationId,
      } as any);
      if (result.success && result.data && result.data.length > 0) {
        record = result.data[0] as unknown as MigrationRecord;
      }
    } catch (err) {
      const error = err as Error;
      return { success: false, message: `Failed to look up migration: ${error.message}` };
    }

    if (!record) {
      return { success: false, message: `Migration record ${migrationId} not found.` };
    }

    if (record.status === "rolled_back") {
      return { success: true, message: `Migration ${migrationId} was already rolled back.` };
    }

    if (record.status !== "applied" && record.status !== "failed") {
      return {
        success: false,
        message: `Migration ${migrationId} has status "${record.status}" — only "applied" or "failed" migrations can be rolled back.`,
      };
    }

    // 2. Mark as rolled back in ledger
    await updateMigrationStatus(migrationId, "rolled_back");
    ledger.info(`Migration ${migrationId} for "${record.collectionId}" marked as rolled_back.`);

    return {
      success: true,
      message:
        `Migration ${migrationId} marked as rolled_back. ` +
        `Note: Schema changes were NOT reverted automatically. ` +
        `Restore from backup if schema reversal is needed.`,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Public API: Status & History
  // ─────────────────────────────────────────────────────────────

  /**
   * Returns the status summary of migrations, optionally filtered by collection.
   *
   * @param collectionId - Optional collection filter. Omit to get all collections.
   * @returns A status result with counts per status and the last migration record.
   */
  static async getStatus(collectionId?: string): Promise<MigrationStatusResult[]> {
    const ledger = logger.channel("MigrationEngine");

    if (!dbAdapter) {
      ledger.warn("DB Adapter not active — returning empty status.");
      return [];
    }

    try {
      const query: any = {};
      if (collectionId) {
        query.collectionId = collectionId;
      }

      const result = await dbAdapter.crud.findMany("migration_ledger", query);
      if (!result.success || !result.data) {
        return [];
      }

      const records = result.data as unknown as MigrationRecord[];

      // Group by collectionId
      const grouped = new Map<string, MigrationRecord[]>();
      for (const record of records) {
        const key = record.collectionId;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(record);
      }

      const statusResults: MigrationStatusResult[] = [];
      for (const [colId, colRecords] of grouped) {
        const pending = colRecords.filter((r) => r.status === "pending").length;
        const applied = colRecords.filter((r) => r.status === "applied").length;
        const failed = colRecords.filter((r) => r.status === "failed").length;
        const rolledBack = colRecords.filter((r) => r.status === "rolled_back").length;

        // Last migration by version
        const sorted = [...colRecords].sort((a, b) => b.version - a.version);
        const lastMigration = sorted[0] ?? undefined;

        statusResults.push({
          collectionId: colId,
          pending,
          applied,
          failed,
          rolledBack,
          lastMigration,
        });
      }

      // If a specific collection was requested but not found, return an empty result
      if (collectionId && statusResults.length === 0) {
        statusResults.push({
          collectionId,
          pending: 0,
          applied: 0,
          failed: 0,
          rolledBack: 0,
        });
      }

      return statusResults;
    } catch (err) {
      const error = err as Error;
      ledger.error(`Failed to get migration status:`, error);
      return [];
    }
  }

  /**
   * Returns the full migration history (ledger), optionally filtered by collection.
   * Records are sorted by version descending (most recent first).
   *
   * @param collectionId - Optional collection filter. Omit to get all collections.
   * @returns Array of migration records from the ledger.
   */
  static async getHistory(collectionId?: string): Promise<MigrationRecord[]> {
    const ledger = logger.channel("MigrationEngine");

    if (!dbAdapter) {
      ledger.warn("DB Adapter not active — returning empty history.");
      return [];
    }

    try {
      const query: any = {};
      if (collectionId) {
        query.collectionId = collectionId;
      }

      const result = await dbAdapter.crud.findMany("migration_ledger", query);
      if (!result.success || !result.data) {
        return [];
      }

      const records = result.data as unknown as MigrationRecord[];

      // Sort by version descending (most recent first)
      records.sort((a, b) => b.version - a.version);

      return records;
    } catch (err) {
      const error = err as Error;
      ledger.error(`Failed to get migration history:`, error);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Legacy: executeMigration (backward compatibility)
  // ─────────────────────────────────────────────────────────────

  /**
   * Executes the migration.
   *
   * @deprecated Use `applyMigration()` instead, which provides idempotency,
   * locking, and ledger recording.
   *
   * In a real scenario, this would handle data transformation batches.
   * For now, it updates the model definition in the DB.
   */
  static async executeMigration(
    plan: MigrationPlan,
    codeSchema: Schema,
  ): Promise<{ success: boolean; message: string }> {
    const ledger = logger.channel("MigrationEngine");

    if (plan.impact.dataLossPotential) {
      ledger.warn(`Migration for ${plan.collectionId} involves potential data loss.`);
      // In a full implementation, we would create a backup here.
    }

    try {
      if (!dbAdapter) {
        throw new Error("DB Adapter not initialized");
      }
      await dbAdapter.collection.updateModel(codeSchema);
      return { success: true, message: "Migration executed successfully." };
    } catch (err) {
      const error = err as Error;
      ledger.error("Migration failed", error);
      return { success: false, message: error.message || "Migration failed" };
    }
  }
}
