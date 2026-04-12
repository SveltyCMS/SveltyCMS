/**
 * @file src/services/audit/audit-log-service.ts
 * @description Tamper-evident audit logging service with append-only log + chain verification.
 */

import { appendFile, readFile, mkdir, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { logger } from "@utils/logger.server";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: {
    id: string;
    email: string;
    ip: string;
  };
  resource: {
    type: string;
    id: string;
  };
  details?: Record<string, unknown>;
  tenantId?: string;
  previousHash: string;
  hash: string;
}

export class AuditLogService {
  private readonly logDir = path.join(process.cwd(), "logs");
  private readonly logFile = path.join(process.cwd(), "logs", "audit.log");
  private lastHash: string = "0000000000000000000000000000000000000000000000000000000000000000";
  private initialized = false;

  constructor() {
    this.init().catch((err) => logger.error("AuditLogService init failed", { error: err }));
  }

  private async init() {
    try {
      await mkdir(this.logDir, { recursive: true });

      // Load last hash from the most recent valid entry
      const lastEntry = await this.getLastEntry();
      if (lastEntry) {
        this.lastHash = lastEntry.hash;
      }
      this.initialized = true;
    } catch (err) {
      logger.error("Failed to initialize AuditLogService", { error: err });
    }
  }

  private async getLastEntry(): Promise<AuditLogEntry | null> {
    try {
      const content = await readFile(this.logFile, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      if (lines.length === 0) return null;

      // Read last line (append-only format: one JSON per line)
      try {
        const lastLine = lines[lines.length - 1];
        return JSON.parse(lastLine) as AuditLogEntry;
      } catch (parseErr) {
        logger.error("Audit log corruption detected in last entry. Starting fresh chain.", {
          error: parseErr,
        });
        // Backup corrupt file to unblock service
        const backupPath = `${this.logFile}.corrupt-${Date.now()}`;
        await rename(this.logFile, backupPath);
        return null;
      }
    } catch (err: any) {
      if (err.code === "ENOENT") return null;
      logger.warn("Could not read last audit entry", { error: err.message });
      return null;
    }
  }

  private hashEntry(entry: Omit<AuditLogEntry, "hash">): string {
    return createHash("sha256").update(JSON.stringify(entry)).digest("hex");
  }

  /**
   * Append a new audit log entry (append-only, very fast)
   */
  public async log(
    action: string,
    actor: { id: string; email: string; ip: string },
    resource: { type: string; id: string },
    details?: Record<string, unknown>,
  ): Promise<AuditLogEntry> {
    if (!this.initialized) await this.init();

    const tenantId = (details as any)?.tenantId;

    const baseEntry: Omit<AuditLogEntry, "hash"> = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      actor,
      resource,
      details: details || undefined,
      tenantId,
      previousHash: this.lastHash,
    };

    const hash = this.hashEntry(baseEntry);
    const fullEntry: AuditLogEntry = { ...baseEntry, hash };

    // Append atomically (one line per entry = NDJSON)
    const line = JSON.stringify(fullEntry) + "\n";
    await appendFile(this.logFile, line, "utf-8");

    this.lastHash = hash; // Update in-memory cache

    return fullEntry;
  }

  /**
   * Get recent logs (most recent first)
   */
  public async getLogs(limit = 50): Promise<AuditLogEntry[]> {
    if (!this.initialized) await this.init();

    try {
      const content = await readFile(this.logFile, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      // Take last N lines and parse
      const recentLines = lines.slice(-limit);
      const logs: AuditLogEntry[] = [];

      for (const line of recentLines) {
        try {
          logs.push(JSON.parse(line));
        } catch (e) {
          logger.warn("Skipping malformed audit log line", { error: e });
        }
      }

      // Return most recent first
      return logs.reverse();
    } catch (err: any) {
      if (err.code === "ENOENT") return [];
      logger.error("Failed to read audit logs", { error: err });
      return [];
    }
  }

  /**
   * Verify integrity of the entire audit chain
   */
  public async verifyChain(): Promise<{ valid: boolean; brokenAt?: string }> {
    try {
      const content = await readFile(this.logFile, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      if (lines.length === 0) return { valid: true };

      let prevHash = "0000000000000000000000000000000000000000000000000000000000000000";

      for (const line of lines) {
        let entry: AuditLogEntry;
        try {
          entry = JSON.parse(line) as AuditLogEntry;
        } catch (e) {
          logger.error("Verification failed: Corrupt line", { error: e });
          return { valid: false };
        }

        if (entry.previousHash !== prevHash) {
          return { valid: false, brokenAt: entry.id };
        }

        const recalculated = this.hashEntry({
          id: entry.id,
          timestamp: entry.timestamp,
          action: entry.action,
          actor: entry.actor,
          resource: entry.resource,
          details: entry.details,
          tenantId: entry.tenantId,
          previousHash: entry.previousHash,
        });

        if (recalculated !== entry.hash) {
          return { valid: false, brokenAt: entry.id };
        }

        prevHash = entry.hash;
      }

      return { valid: true };
    } catch (err) {
      logger.error("Audit chain verification failed", { error: err });
      return { valid: false };
    }
  }

  /**
   * Rotate log file (optional - call periodically via cron)
   */
  public async rotateLog(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(this.logDir, `audit-${timestamp}.log`);

    try {
      await rename(this.logFile, backupPath);
      this.lastHash = "0000000000000000000000000000000000000000000000000000000000000000";
      logger.info(`Audit log rotated to ${backupPath}`);
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        logger.error("Failed to rotate audit log", { error: err });
      }
    }
  }
}

// Singleton instance
export const auditLogService = new AuditLogService();
