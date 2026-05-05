/**
 * @file src/services/security/audit-service.ts
 * @description
 * Unified Audit Service providing high-integrity, multi-tenant audit logging.
 */

import { appendFile, readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { dbAdapter as dbAdapterInstance } from "@src/databases/db";
import type {
  BaseEntity,
  DatabaseId,
  DatabaseResult,
  IDBAdapter,
} from "@src/databases/db-interface";
import { logger } from "@utils/logger";

// ============================================================================
// TYPES & ENUMS
// ============================================================================

export type AuditSeverity = "low" | "medium" | "high" | "critical";

export enum AuditEventType {
  USER_LOGIN = "user_login",
  USER_LOGOUT = "user_logout",
  USER_LOGIN_FAILED = "user_login_failed",
  PASSWORD_CHANGE = "password_change",
  PASSWORD_RESET = "password_reset",
  PASSWORD_RESET_REQUESTED = "password_reset_requested",
  PASSWORD_RESET_SUCCESS = "password_reset_success",
  TWO_FACTOR_ENABLED = "two_factor_enabled",
  TWO_FACTOR_DISABLED = "two_factor_disabled",
  USER_CREATED = "user_created",
  USER_UPDATED = "user_updated",
  USER_DELETED = "user_deleted",
  USER_ROLE_CHANGED = "user_role_changed",
  USER_STATUS_CHANGED = "user_status_changed",
  TOKEN_CREATED = "token_created",
  TOKEN_UPDATED = "token_updated",
  TOKEN_DELETED = "token_deleted",
  TOKEN_USED = "token_used",
  TOKEN_MISUSE = "token_misuse",
  DATA_EXPORT = "data_export",
  DATA_IMPORT = "data_import",
  DATA_DELETION = "data_deletion",
  UNAUTHORIZED_ACCESS = "unauthorized_access",
  PRIVILEGE_ESCALATION = "privilege_escalation",
  DATA_BREACH_ATTEMPT = "data_breach_attempt",
  SUSPICIOUS_ACTIVITY = "suspicious_activity",
  WEBHOOK_TRIGGERED = "webhook_triggered",
  WORKFLOW_TRANSITION = "workflow_transition",
}

export interface AuditLogEntry extends BaseEntity {
  action: string;
  message?: string;
  actorEmail?: string;
  actorId: DatabaseId | null;
  actorRole?: string;
  correlationId?: string;
  details: Record<string, unknown>;
  errorDetails?: string;
  eventType: AuditEventType;
  ipAddress?: string;
  result: "success" | "failure" | "partial";
  sessionId?: string;
  severity: AuditSeverity;
  targetId?: DatabaseId | null;
  targetType?: string;
  tenantId?: DatabaseId | null;
  timestamp: string;
  userAgent?: string;
  previousHash?: string;
  hash?: string;
}

export interface AuditQueryOptions {
  actorId?: DatabaseId;
  endDate?: string;
  eventTypes?: AuditEventType[];
  limit?: number;
  offset?: number;
  severity?: AuditSeverity;
  startDate?: string;
  targetId?: DatabaseId;
  tenantId?: string;
}

export interface AuditStatistics {
  eventsByResult: Record<"success" | "failure" | "partial", number>;
  eventsBySeverity: Record<AuditSeverity, number>;
  eventsByType: Record<string, number>;
  period: { start: string; end: string };
  totalEvents: number;
}

// ============================================================================
// HASH WORKER POOL
// ============================================================================

const HASH_WORKER_SCRIPT = `
  const { parentPort } = require('node:worker_threads');
  const { createHash } = require('node:crypto');

  parentPort.on('message', ({ id, data }) => {
    try {
      const hash = createHash("sha256").update(data).digest("hex");
      parentPort.postMessage({ id, hash });
    } catch (err) {
      parentPort.postMessage({ id, error: err.message });
    }
  });
`;

class HashWorkerPool {
  private workers: Worker[] = [];
  private nextWorkerIndex = 0;
  private callbacks = new Map<
    number,
    { resolve: (hash: string) => void; reject: (err: Error) => void }
  >();
  private messageIdCounter = 0;

  constructor(size = 4) {
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
      for (let i = 0; i < size; i++) {
        try {
          const worker = new Worker(HASH_WORKER_SCRIPT, { eval: true });
          worker.on("message", ({ id, hash, error }) => {
            const cb = this.callbacks.get(id);
            if (cb) {
              if (error) cb.reject(new Error(error));
              else cb.resolve(hash);
              this.callbacks.delete(id);
            }
          });
          worker.on("error", (err) => logger.error("Audit Hash Worker Error", { error: err }));
          this.workers.push(worker);
        } catch (e) {
          logger.error("Failed to spawn audit worker", e);
        }
      }
    }
  }

  public async hash(data: string): Promise<string> {
    if (this.workers.length === 0) {
      return createHash("sha256").update(data).digest("hex");
    }
    return new Promise((resolve, reject) => {
      const id = this.messageIdCounter++;
      this.callbacks.set(id, { resolve, reject });
      const worker = this.workers[this.nextWorkerIndex];
      this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
      worker.postMessage({ id, data });
    });
  }
}

const hashPool = new HashWorkerPool();

// ============================================================================
// UNIFIED AUDIT SERVICE
// ============================================================================

export class AuditService {
  private readonly collectionName = "auditLogs";
  private readonly logDir = path.join(process.cwd(), "logs");
  private readonly logFile = path.join(process.cwd(), "logs", "audit.log");
  private lastHash: string = "0000000000000000000000000000000000000000000000000000000000000000";
  private initialized = false;
  private fileWriteQueue: string[] = [];
  private isWriting = false;

  constructor() {
    this.init().catch((err) => logger.error("AuditService init failed", { error: err }));
  }

  private async init() {
    if (this.initialized) return;
    try {
      await mkdir(this.logDir, { recursive: true });
      const lastEntry = await this.getLastFileEntry();
      if (lastEntry) this.lastHash = lastEntry.hash!;
      this.initialized = true;
    } catch (err) {
      logger.error("Failed to initialize AuditService storage", { error: err });
    }
  }

  private async flushFileQueue() {
    if (this.isWriting || this.fileWriteQueue.length === 0) return;
    this.isWriting = true;
    try {
      const batch = this.fileWriteQueue.join("");
      this.fileWriteQueue = [];
      await appendFile(this.logFile, batch, "utf-8");
    } catch (err) {
      logger.error("Audit hardened persistence failed", { error: err });
    } finally {
      this.isWriting = false;
      if (this.fileWriteQueue.length > 0) {
        this.flushFileQueue(); // flush remaining
      }
    }
  }

  private async getLastFileEntry(): Promise<Partial<AuditLogEntry> | null> {
    try {
      const content = await readFile(this.logFile, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      if (lines.length === 0) return null;
      try {
        return JSON.parse(lines[lines.length - 1]);
      } catch {
        return null;
      }
    } catch (err: any) {
      if (err.code === "ENOENT") return null;
      return null;
    }
  }

  private async getDb(): Promise<IDBAdapter> {
    if (!dbAdapterInstance) throw new Error("Database not initialized");
    return dbAdapterInstance;
  }

  async log(
    action: string,
    actor: { id: DatabaseId | null; email: string; ip?: string; role?: string },
    resource: { type: string; id: DatabaseId | null },
    eventType: AuditEventType,
    severity: AuditSeverity = "medium",
    details: Record<string, unknown> = {},
    tenantId?: DatabaseId | null,
    result: "success" | "failure" | "partial" = "success",
  ): Promise<void> {
    const entry: Omit<AuditLogEntry, "_id" | "createdAt" | "updatedAt"> = {
      action,
      actorId: actor.id,
      actorEmail: actor.email,
      ipAddress: actor.ip,
      actorRole: actor.role,
      targetId: resource.id,
      targetType: resource.type,
      eventType,
      severity,
      details,
      tenantId,
      result,
      timestamp: new Date().toISOString(),
    };
    await this.logEvent(entry);
  }

  async logEvent(
    entry: Omit<AuditLogEntry, "_id" | "createdAt" | "updatedAt" | "timestamp"> & {
      timestamp?: string;
    },
  ): Promise<void> {
    if (!this.initialized) await this.init();
    try {
      const db = await this.getDb();
      const timestamp = entry.timestamp || new Date().toISOString();
      const fullEntry: Omit<AuditLogEntry, "_id"> = {
        ...entry,
        timestamp,
        createdAt: timestamp as any,
        updatedAt: timestamp as any,
        details: entry.details || {},
      };

      const baseForHash = { ...fullEntry, previousHash: this.lastHash };
      const hash = createHash("sha256").update(JSON.stringify(baseForHash)).digest("hex");
      const hardenedEntry = { ...baseForHash, hash };

      // Update immediate pointer
      this.lastHash = hash;

      // Fire and forget to background file writer
      this.fileWriteQueue.push(JSON.stringify(hardenedEntry) + "\n");
      this.flushFileQueue().catch(() => {});

      const dbEntry = { ...fullEntry, hash, previousHash: hardenedEntry.previousHash };
      await db.crud.insert<AuditLogEntry>(this.collectionName, dbEntry);

      if (entry.severity === "high" || entry.severity === "critical") {
        logger.warn(`AUDIT [${entry.severity.toUpperCase()}]: ${entry.eventType}`, {
          action: entry.action,
          actor: entry.actorEmail,
        });
      }
    } catch (error) {
      logger.error("Audit logging exception", { error });
    }
  }

  async queryLogs(options: AuditQueryOptions = {}): Promise<DatabaseResult<AuditLogEntry[]>> {
    try {
      const db = await this.getDb();
      const filters: Record<string, unknown> = {};
      if (options.eventTypes?.length) filters.eventType = { $in: options.eventTypes };
      if (options.actorId) filters.actorId = options.actorId;
      if (options.targetId) filters.targetId = options.targetId;
      if (options.tenantId) filters.tenantId = options.tenantId;
      if (options.severity) filters.severity = options.severity;
      if (options.startDate || options.endDate) {
        filters.timestamp = {};
        if (options.startDate) (filters.timestamp as any).$gte = options.startDate;
        if (options.endDate) (filters.timestamp as any).$lte = options.endDate;
      }
      const result = await db.crud.findMany<AuditLogEntry>(this.collectionName, filters, {
        limit: options.limit || 100,
        offset: options.offset || 0,
      });
      if (result.success && result.data) {
        result.data.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
      }
      return result;
    } catch (error) {
      return {
        success: false,
        message: "Query failed",
        error: { code: "QUERY_ERROR", message: String(error) },
      };
    }
  }

  async getStatistics(days = 30): Promise<DatabaseResult<AuditStatistics>> {
    try {
      const db = await this.getDb();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const pipeline = [
        { $match: { timestamp: { $gte: startDate.toISOString() } } },
        {
          $group: {
            _id: { eventType: "$eventType", severity: "$severity", result: "$result" },
            count: { $sum: 1 },
          },
        },
      ];
      const result = await db.crud.aggregate<{
        _id: { eventType: string; severity: string; result: string };
        count: number;
      }>(this.collectionName, pipeline);
      if (!result.success) return result as any;
      const stats: AuditStatistics = {
        totalEvents: 0,
        eventsByType: {},
        eventsBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
        eventsByResult: { success: 0, failure: 0, partial: 0 },
        period: { start: startDate.toISOString(), end: new Date().toISOString() },
      };
      result.data?.forEach((item) => {
        stats.totalEvents += item.count;
        stats.eventsByType[item._id.eventType] =
          (stats.eventsByType[item._id.eventType] || 0) + item.count;
        stats.eventsBySeverity[item._id.severity as AuditSeverity] += item.count;
        stats.eventsByResult[item._id.result as "success" | "failure" | "partial"] += item.count;
      });
      return { success: true, data: stats };
    } catch (err) {
      return {
        success: false,
        message: "Stats failed",
        error: { code: "STATS_ERROR", message: String(err) },
      };
    }
  }

  async verifyHardenedChain(): Promise<{ valid: boolean; brokenAt?: string }> {
    try {
      const content = await readFile(this.logFile, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      let prevHash = "0000000000000000000000000000000000000000000000000000000000000000";
      for (const line of lines) {
        const entry = JSON.parse(line) as AuditLogEntry;
        if (entry.previousHash !== prevHash) return { valid: false, brokenAt: String(entry._id) };
        const baseForHash = { ...entry };
        delete (baseForHash as any).hash;
        const recalculated = await hashPool.hash(JSON.stringify(baseForHash));
        if (recalculated !== entry.hash) return { valid: false, brokenAt: String(entry._id) };
        prevHash = entry.hash!;
      }
      return { valid: true };
    } catch {
      return { valid: false };
    }
  }

  async getLogs(limit = 50): Promise<AuditLogEntry[]> {
    const res = await this.queryLogs({ limit });
    return res.success ? res.data || [] : [];
  }
}

export const auditService = new AuditService();
export const auditLogService = auditService;
export const logAuditEvent = auditService.logEvent.bind(auditService);
export const queryAuditLogs = auditService.queryLogs.bind(auditService);
export const getLogs = auditService.getLogs.bind(auditService);
