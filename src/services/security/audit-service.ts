/**
 * @file src/services/security/audit-service.ts
 * @description Unified Audit Service providing high-integrity, multi-tenant audit logging.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { dbAdapter as dbAdapterInstance } from "@src/databases/db";
import type {
  BaseEntity,
  DatabaseId,
  DatabaseResult,
  IDBAdapter,
} from "@src/databases/db-interface";
import { logger } from "@utils/logger";

export type AuditSeverity = "low" | "medium" | "high" | "critical";

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
    if (process.env.DISABLE_AUDIT_LOGS === "true") return;
    this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);
  }

  public async flush() {
    if (this.buffer.length === 0) return;
    if (process.env.DISABLE_AUDIT_LOGS === "true") {
      this.buffer = [];
      return;
    }

    const entriesToFlush = [...this.buffer];
    this.buffer = [];

    try {
      if (dbAdapterInstance) {
        // Bulk insert if supported, otherwise loop
        if (dbAdapterInstance.batch?.bulkInsert) {
          await dbAdapterInstance.batch.bulkInsert(this.collectionName, entriesToFlush);
        } else {
          for (const entry of entriesToFlush) {
            await dbAdapterInstance.crud.insert(this.collectionName, entry);
          }
        }
      }

      const logData = entriesToFlush.map((e) => JSON.stringify(e)).join("\n") + "\n";
      await appendFile(this.logFile, logData);
    } catch (error) {
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
    if (process.env.DISABLE_AUDIT_LOGS === "true") {
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
      handler: async (collection: string, data: any, options: any) => {
        if (collection === this.collectionName) return;

        await this.log(
          "Automatic Audit",
          { id: "system" as DatabaseId, email: "system@svelty.cms", role: "system" },
          { type: collection, id: (data as any)?._id || "unknown" },
          AuditEventType.DATA_IMPORT,
          "low",
          { data },
          options?.tenantId,
        );
      },
    });
    logger.info("[Audit] Registered global Titan Tier hooks.");
  }

  private async init() {
    if (this.initialized) return;
    if (process.env.DISABLE_AUDIT_LOGS === "true") {
      this.initialized = true;
      return;
    }
    try {
      await mkdir(path.dirname(this.logFile), { recursive: true });
      this.initialized = true;
    } catch (err) {
      logger.error("Failed to initialize AuditService storage", err);
    }
  }

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
    if (process.env.DISABLE_AUDIT_LOGS === "true") return;

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
    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  async queryLogs(options: any = {}): Promise<DatabaseResult<AuditLogEntry[]>> {
    try {
      if (!dbAdapterInstance) throw new Error("Database not initialized");
      return await dbAdapterInstance.crud.findMany<AuditLogEntry>(
        this.collectionName,
        options.filters || {},
        {
          limit: options.limit || 100,
          offset: options.offset || 0,
        },
      );
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
