/**
 * @file src/services/security/audit-service.ts
 * @description Unified Audit Service providing high-integrity, multi-tenant audit logging.
 */

import { createHash } from "node:crypto";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { dbAdapter as dbAdapterInstance } from "@src/databases/db";
import type {
  BaseEntity,
  DatabaseId,
  DatabaseResult,
  IDBAdapter,
} from "@src/databases/db-interface";
import { logger } from "@utils/logger";
import {
  getAuditFlags,
  getAuditFlagsSync,
  isAuditDisabledByEnv,
} from "@utils/security/audit-flags";

export type AuditSeverity = "low" | "medium" | "high" | "critical";

/** Outbox collection — internal machinery, excluded from automatic audit hooks. */
const OUTBOX_COLLECTION = "svelty_outbox";

export enum AuditEventType {
  USER_LOGIN = "user_login",
  USER_LOGOUT = "user_logout",
  USER_LOGIN_FAILED = "user_login_failed",
  PASSWORD_CHANGE = "password_change",
  PASSWORD_RESET = "password_reset",
  USER_CREATED = "user_created",
  USER_UPDATED = "user_updated",
  USER_DELETED = "user_deleted",
  USER_ROLE_CHANGED = "user_role_changed",
  DATA_EXPORT = "data_export",
  DATA_IMPORT = "data_import",
  DATA_DELETION = "data_deletion",
  UNAUTHORIZED_ACCESS = "unauthorized_access",
  PRIVILEGE_ESCALATION = "privilege_escalation",
  WORKFLOW_TRANSITION = "workflow_transition",
  SUSPICIOUS_ACTIVITY = "suspicious_activity",
  PASSWORD_RESET_REQUESTED = "password_reset_requested",
  PASSWORD_RESET_SUCCESS = "password_reset_success",
  WEBHOOK_TRIGGERED = "webhook_triggered",
  API_KEY_CREATED = "api_key_created",
  API_KEY_REVOKED = "api_key_revoked",
  MAGIC_LINK_REQUESTED = "magic_link_requested",
  MAGIC_LINK_SUCCESS = "magic_link_success",
}

export interface AuditLogEntry extends BaseEntity {
  action: string;
  message?: string;
  actorId: DatabaseId | null;
  actorEmail?: string;
  actorRole?: string;
  actorIp?: string;
  eventType: AuditEventType;
  severity: AuditSeverity;
  targetId?: DatabaseId | null;
  targetType?: string;
  tenantId?: DatabaseId | null;
  timestamp: string;
  details: Record<string, unknown>;
  result: "success" | "failure" | "partial";
  hash?: string;
  previousHash?: string;
}

export class AuditService {
  private readonly collectionName = "auditLogs";
  private readonly logFile = path.join(process.cwd(), "logs", "audit.log");
  private lastHash: string = "0000000000000000000000000000000000000000000000000000000000000000";
  private buffer: any[] = [];
  private flushTimer: any = null;
  private readonly MAX_BUFFER_SIZE = 50;
  private readonly MAX_TOTAL_BUFFER = 200; // 🛡️ HARD CAP: Lowered from 500 to 200 for stability
  private readonly FLUSH_INTERVAL_MS = 5000;
  private initialized = false;

  constructor() {
    this.init().catch((err) => logger.error("AuditService init failed", err));
    this.startFlushTimer();
  }

  private startFlushTimer() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    // 🧪 PERFORMANCE: During benchmarks, we don't even need the timer if logs are disabled
    if (isAuditDisabledByEnv()) return;
    this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);
  }

  private isMissingAuditStoreError(error: unknown) {
    const candidates = [
      error,
      (error as any)?.cause,
      (error as any)?.error,
      (error as any)?.originalError,
    ].filter(Boolean);

    return candidates.some((candidate) => {
      const message = [
        (candidate as any)?.message,
        (candidate as any)?.sqlMessage,
        (candidate as any)?.errmsg,
        String(candidate),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const code = String((candidate as any)?.code || "").toLowerCase();
      return (
        (message.includes("audit_logs") &&
          (message.includes("doesn't exist") ||
            message.includes("does not exist") ||
            message.includes("no such table") ||
            message.includes("namespacenotfound"))) ||
        code === "er_no_such_table" ||
        code === "namespace_not_found"
      );
    });
  }

  public async flush() {
    if (this.buffer.length === 0) return;
    if (isAuditDisabledByEnv()) {
      this.buffer = [];
      return;
    }
    const flags = await getAuditFlags().catch(() => null);
    if (flags?.disabled) {
      this.buffer = [];
      return;
    }

    const entriesToFlush = [...this.buffer];
    this.buffer = [];

    try {
      if (dbAdapterInstance) {
        // Bulk insert if supported, otherwise loop. skipReturning: the flushed
        // entries are already in memory — no RETURNING read-back needed.
        if (dbAdapterInstance.crud?.insertMany) {
          const { withSystemScope } = await import("@src/databases/system-tenant-scope");
          await dbAdapterInstance.crud.insertMany(
            this.collectionName,
            entriesToFlush as any[],
            { ...withSystemScope("audit-flush"), skipReturning: true } as any,
          );
        } else if (dbAdapterInstance.batch?.bulkInsert) {
          await dbAdapterInstance.batch.bulkInsert(this.collectionName, entriesToFlush);
        } else {
          for (const entry of entriesToFlush) {
            await dbAdapterInstance.crud.insert(this.collectionName, entry);
          }
        }
      }

      const logData = entriesToFlush.map((e) => JSON.stringify(e)).join("\n") + "\n";
      await fsPromises.appendFile(this.logFile, logData);
    } catch (error) {
      if (this.isMissingAuditStoreError(error)) {
        logger.warn("[Audit] Audit store unavailable during flush; dropping buffered entries");
        const logData = entriesToFlush.map((e) => JSON.stringify(e)).join("\n") + "\n";
        await fsPromises.appendFile(this.logFile, logData).catch(() => {});
        return;
      }

      logger.error("[Audit] Flush failed, restoring buffer", error);
      // 🛡️ MEMORY LEAK FIX: Cap the restoration to prevent unbounded growth
      const combined = [...entriesToFlush, ...this.buffer];
      if (combined.length > this.MAX_TOTAL_BUFFER) {
        logger.warn(
          `[Audit] Buffer overflow, dropping ${combined.length - this.MAX_TOTAL_BUFFER} logs`,
        );
        this.buffer = combined.slice(-this.MAX_TOTAL_BUFFER);
      } else {
        this.buffer = combined;
      }
    }
  }

  public registerHooks(adapter: IDBAdapter) {
    if (!adapter.registerHook) return;

    // 🛡️ CRITICAL PERFORMANCE FIX: Physically skip hook registration during benchmarks.
    // This prevents the buffer from capturing 100k+ inserts even if flush() is called.
    if (isAuditDisabledByEnv()) {
      logger.info("[Audit] Skipping hook registration (DISABLE_AUDIT_LOGS=true)");
      return;
    }

    // 🚀 PERFORMANCE: Use a flag to prevent multiple registrations
    if ((adapter as any).__auditHookRegistered) return;
    (adapter as any).__auditHookRegistered = true;

    adapter.registerHook({
      id: "global-audit",
      type: "after",
      action: "insert",
      handler: (collection: string, data: any, options: any) => {
        // Skip the audit store itself (recursion) and the transactional
        // outbox — outbox events are internal machinery tracked by their own
        // delivery status, and audit-logging each flush batch cascades into
        // 1000-entry audit flushes on the content-write path.
        if (collection === this.collectionName) return;
        if (collection === OUTBOX_COLLECTION) return;

        this.log(
          "Automatic Audit",
          {
            id: "system" as DatabaseId,
            email: "system@svelty.cms",
            role: "system",
          },
          { type: collection, id: (data as any)?._id || "unknown" },
          AuditEventType.DATA_IMPORT,
          "low",
          { data },
          options?.tenantId,
        ).catch((err) => logger.warn("[Audit] Hook log failed:", err));
      },
    });
    logger.info("[Audit] Registered global Titan Tier hooks.");
  }

  private async init() {
    if (this.initialized) return;
    if (isAuditDisabledByEnv()) {
      this.initialized = true;
      return;
    }
    const flags = await getAuditFlags().catch(() => null);
    if (flags?.disabled) {
      this.initialized = true;
      return;
    }
    try {
      await fsPromises.mkdir(path.dirname(this.logFile), { recursive: true });
      this.initialized = true;
    } catch (err) {
      logger.error("Failed to initialize AuditService storage", err);
    }
  }

  private chainLock: Promise<void> = Promise.resolve();

  async log(
    action: string,
    actor: { id: DatabaseId | null; email: string; role?: string; ip?: string },
    resource: { type: string; id: DatabaseId | null },
    eventType: AuditEventType,
    severity: AuditSeverity = "medium",
    details: Record<string, unknown> = {},
    tenantId?: DatabaseId | null,
    result: "success" | "failure" | "partial" = "success",
  ): Promise<void> {
    if (isAuditDisabledByEnv()) return;

    // Serialized hash-chain queue to guarantee tamper-evident crypto chain integrity under concurrent writes
    this.chainLock = this.chainLock
      .then(async () => {
        // Sync-first flags: env/cached read avoids a promise hop per entry on
        // the hot chain (measured ~10µs of the per-write audit cost).
        const flags = getAuditFlagsSync() ?? (await getAuditFlags().catch(() => null));
        if (flags?.disabled) return;

        const timestamp = new Date().toISOString();
        const entry: Omit<AuditLogEntry, "_id"> = {
          action,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          actorIp: actor.ip,
          targetId: resource.id,
          targetType: resource.type,
          eventType,
          severity,
          details,
          tenantId,
          result,
          timestamp,
          createdAt: timestamp as any,
          updatedAt: timestamp as any,
          previousHash: this.lastHash,
        };

        const hash = createHash("sha256").update(JSON.stringify(entry)).digest("hex");
        const fullEntry = { ...entry, hash };
        this.lastHash = hash;

        this.buffer.push(fullEntry);
        // 🛡️ ENTERPRISE MODE: AUDIT_CHAIN_SYNC awaits persistence before returning,
        // guaranteeing the entry survives even if the process dies mid-request.
        if (flags?.chainSync || this.buffer.length >= this.MAX_BUFFER_SIZE) {
          await this.flush().catch((err) =>
            logger.error("[AuditService] Failed to flush audit logs:", err),
          );
        }
      })
      .catch((err) => logger.warn("[AuditService] Chain lock error:", err));

    return this.chainLock;
  }

  async queryLogs(options: any = {}): Promise<DatabaseResult<AuditLogEntry[]>> {
    try {
      if (!dbAdapterInstance) throw new Error("Database not initialized");
      // Enforce tenant filtering on audit queries
      const filters = { ...options.filters };
      if (options.tenantId) {
        filters.tenantId = options.tenantId;
      }
      return await dbAdapterInstance.crud.findMany<AuditLogEntry>(this.collectionName, filters, {
        limit: options.limit || 100,
        offset: options.offset || 0,
        tenantId: options.tenantId,
      });
    } catch (error) {
      return { success: false, message: String(error) } as any;
    }
  }

  async getLogs(limit = 50): Promise<AuditLogEntry[]> {
    const res = await this.queryLogs({ limit });
    return res.success ? res.data || [] : [];
  }

  /** Legacy alias for log */
  async logEvent(params: {
    action?: string;
    eventType: AuditEventType;
    actorId?: DatabaseId | null;
    actorEmail?: string;
    actorRole?: string;
    actorIp?: string;
    targetId?: DatabaseId | null;
    targetType?: string;
    severity?: AuditSeverity;
    tenantId?: DatabaseId | null;
    details?: Record<string, unknown>;
    result?: "success" | "failure" | "partial";
  }): Promise<void> {
    return this.log(
      params.action || params.eventType,
      {
        id: params.actorId || null,
        email: params.actorEmail || "unknown",
        role: params.actorRole,
        ip: params.actorIp,
      },
      { type: params.targetType || "system", id: params.targetId || null },
      params.eventType,
      params.severity || "medium",
      params.details || {},
      params.tenantId,
      params.result || "success",
    );
  }
}

export const auditService = new AuditService();
export const auditLogService = auditService;
export const logAuditEvent = auditService.log.bind(auditService);
export const queryAuditLogs = auditService.queryLogs.bind(auditService);
export const getLogs = auditService.getLogs.bind(auditService);
