/**
 * @file src/services/outbox/outbox-service.ts
 * @description
 * Transactional Outbox Service ensuring that events (webhooks, audit logs,
 * automation triggers) are emitted atomically with the database state
 * changes that caused them.
 *
 * ### Why a Transactional Outbox?
 * Without it, if a DB write succeeds but event emission fails, the event is
 * lost. Conversely, if the DB write fails after event emission, the event is
 * orphaned. The outbox writes events to the SAME database transaction as the
 * data change, then a separate background process reads and delivers them.
 *
 * ### Features:
 * - transaction-aware write: uses the same `transaction` from BaseQueryOptions
 * - background polling with configurable interval
 * - exponential backoff for failed deliveries (updatedAt + 2^attempts, capped)
 * - tenant-scoped event isolation
 * - integration with webhook delivery pipeline
 * - DISABLE_OUTBOX / BENCHMARK_MODE kill-switch
 */

import { getDb } from "@src/databases/db";
import { generateUUID } from "@src/utils/native-utils";
import { nowISODateString } from "@utils/date";
import { logger } from "@utils/logger";
import { pubSub } from "@src/services/background/pub-sub";
import type { BaseQueryOptions, DatabaseResult } from "@src/databases/db-interface";

/** Possible delivery statuses for an outbox event */
export type OutboxEventStatus = "pending" | "delivered" | "failed";

/**
 * Schema for an outbox event stored in the outbox table/collection.
 * Written atomically within the same transaction as the triggering data change.
 */
export interface OutboxEvent {
  _id: string;
  tenantId: string;
  eventType: string; // e.g. "entry:create", "media:delete"
  aggregateType: string; // e.g. "entry", "media", "webhook"
  aggregateId: string; // the ID of the entity that changed
  payload: unknown; // the event data
  status: OutboxEventStatus;
  createdAt: string; // ISODateString
  deliveredAt?: string; // ISODateString
  attempts: number;
  lastError?: string;
  updatedAt: string; // ISODateString
}

/** Collection/table name where outbox events are stored */
export const OUTBOX_COLLECTION = "svelty_outbox";

/** Max delivery attempts before permanent failure */
export const OUTBOX_MAX_ATTEMPTS = 5;

/** Cap for exponential backoff (5 minutes) */
export const OUTBOX_BACKOFF_CAP_MS = 300_000;

/**
 * Map from outbox event types to webhook event types.
 * Allows content operations to emit generic outbox events that are
 * automatically fanned out to the correct webhook subscribers.
 */
const OUTBOX_TO_WEBHOOK_EVENT: Record<string, string | undefined> = {
  "entry:create": "entry:create",
  "entry:update": "entry:update",
  "entry:delete": "entry:delete",
  "entry:publish": "entry:publish",
  "entry:unpublish": "entry:unpublish",
  "media:upload": "media:upload",
  "media:delete": "media:delete",
  "config.exported": "config.exported",
  "config.plan.created": "config.plan.created",
  "config.applied": "config.applied",
  "content.exported": "content.exported",
  "content.import.started": "content.import.started",
  "content.import.completed": "content.import.completed",
  "backup.created": "backup.created",
  "backup.restore.started": "backup.restore.started",
  "backup.restore.completed": "backup.restore.completed",
  "migration.applied": "migration.applied",
  "migration.verified": "migration.verified",
  "migration.failed": "migration.failed",
  "content.sync.started": "content.sync.started",
  "content.sync.completed": "content.sync.completed",
};

/**
 * Exponential backoff delay after `attempts` failures.
 * attempt 1 → 1s, 2 → 2s, 3 → 4s, … capped at OUTBOX_BACKOFF_CAP_MS.
 */
export function outboxBackoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  const delay = 1000 * Math.pow(2, attempts - 1);
  return Math.min(OUTBOX_BACKOFF_CAP_MS, delay);
}

/** True if a pending event is past its backoff window and ready to deliver. */
export function isOutboxEventReady(event: OutboxEvent, nowMs = Date.now()): boolean {
  if (event.status !== "pending") return false;
  const attempts = event.attempts || 0;
  if (attempts <= 0) return true;
  const updatedMs = Date.parse(event.updatedAt || event.createdAt || "");
  if (Number.isNaN(updatedMs)) return true;
  return nowMs >= updatedMs + outboxBackoffMs(attempts);
}

function isOutboxDisabled(): boolean {
  return process.env.BENCHMARK_MODE === "true" || process.env.DISABLE_OUTBOX === "true";
}

class OutboxServiceImpl {
  public readonly collectionName = OUTBOX_COLLECTION;

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  /**
   * Emit an event to the outbox.
   *
   * When called inside a database transaction, pass `options.transaction` so the
   * event is written on the same connection and rolls back with the data change.
   */
  public async emit(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: unknown,
    tenantId: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<OutboxEvent>> {
    const db = getDb();
    if (!db) {
      logger.warn("[Outbox] Database not available; event will not be persisted");
      return {
        success: false,
        message: "Database not available",
        error: { code: "OUTBOX_ERROR", message: "Database not available" },
      };
    }

    if (isOutboxDisabled()) {
      logger.debug(`[Outbox] Skipped emit ${eventType} (benchmark/disabled mode)`);
      return {
        success: false,
        message: "Outbox disabled",
        error: { code: "OUTBOX_DISABLED", message: "Outbox disabled" },
      };
    }

    const now = nowISODateString();
    const event: OutboxEvent = {
      _id: generateUUID(),
      tenantId: tenantId || "default",
      eventType,
      aggregateType,
      aggregateId: String(aggregateId),
      payload,
      status: "pending",
      createdAt: now,
      attempts: 0,
      updatedAt: now,
    };

    try {
      const result = await db.crud.insert(this.collectionName, event as any, options);
      if (result.success) {
        logger.debug(`[Outbox] Emitted ${eventType} event ${event._id} for tenant ${tenantId}`);
        // Prefer returned row when adapter fills defaults
        return {
          success: true,
          data: (result.data as unknown as OutboxEvent) || event,
        };
      }
      return result as DatabaseResult<OutboxEvent>;
    } catch (error: any) {
      logger.error(`[Outbox] Failed to emit ${eventType} event:`, error);
      return {
        success: false,
        message: `Outbox emit failed: ${error.message}`,
        error: { code: "OUTBOX_EMIT_FAILED", message: error.message },
      };
    }
  }

  /**
   * Process a batch of pending outbox events (FIFO, with exponential backoff skip).
   */
  public async processBatch(
    batchSize = 50,
  ): Promise<{ processed: number; delivered: number; failed: number }> {
    const empty = { processed: 0, delivered: 0, failed: 0 };
    if (this.isProcessing) return empty;
    this.isProcessing = true;

    const db = getDb();
    if (!db) {
      this.isProcessing = false;
      return empty;
    }

    let delivered = 0;
    let failed = 0;
    let processed = 0;

    try {
      // Over-fetch so backoff-skipped events don't starve the batch
      const pendingEvents = await this._fetchPending(db, batchSize * 3);
      const ready = pendingEvents.filter((e) => isOutboxEventReady(e)).slice(0, batchSize);
      if (ready.length === 0) return empty;

      for (const event of ready) {
        processed += 1;
        const ok = await this._deliver(event, db).catch((err) => {
          logger.error(`[Outbox] Delivery error for event ${event._id}:`, err);
          return false;
        });
        if (ok) delivered += 1;
        else failed += 1;
      }
    } catch (error) {
      logger.error("[Outbox] Batch processing error:", error);
    } finally {
      this.isProcessing = false;
    }

    return { processed, delivered, failed };
  }

  private async _fetchPending(
    db: NonNullable<ReturnType<typeof getDb>>,
    limit: number,
  ): Promise<OutboxEvent[]> {
    const result = (await db.crud.findMany(this.collectionName, { status: "pending" } as any, {
      limit,
      sort: { createdAt: "asc" },
    })) as unknown as DatabaseResult<OutboxEvent[]>;

    return result.success && result.data ? result.data : [];
  }

  /**
   * Deliver a single outbox event.
   * @returns true if delivered, false if failed (will retry / permanent fail)
   */
  private async _deliver(
    event: OutboxEvent,
    db: NonNullable<ReturnType<typeof getDb>>,
  ): Promise<boolean> {
    const eventId = event._id;

    try {
      // 1. Internal pub/sub for automations / listeners
      await pubSub.publish(
        "outbox:event" as any,
        {
          eventId: event._id,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload,
          tenantId: event.tenantId,
        } as any,
      );

      // 2. Webhook fan-out for mapped event types
      const webhookEvent = OUTBOX_TO_WEBHOOK_EVENT[event.eventType];
      if (webhookEvent) {
        const { webhookService } = await import("@src/services/background/webhook-service");
        await webhookService.trigger(webhookEvent as any, event.payload, event.tenantId);
      }

      // 3. Mark delivered
      await db.crud.update(
        this.collectionName,
        eventId as any,
        {
          status: "delivered",
          deliveredAt: nowISODateString(),
          updatedAt: nowISODateString(),
        } as any,
      );

      logger.debug(`[Outbox] Delivered ${event.eventType} event ${eventId}`);
      return true;
    } catch (error: any) {
      const newAttempts = (event.attempts || 0) + 1;
      const isFinal = newAttempts >= OUTBOX_MAX_ATTEMPTS;

      await db.crud.update(
        this.collectionName,
        eventId as any,
        {
          status: isFinal ? "failed" : "pending",
          attempts: newAttempts,
          lastError: String(error?.message || error).slice(0, 500),
          updatedAt: nowISODateString(),
        } as any,
      );

      if (isFinal) {
        logger.error(`[Outbox] Event ${eventId} permanently failed after ${newAttempts} attempts`);
      } else {
        logger.warn(
          `[Outbox] Event ${eventId} delivery failed (attempt ${newAttempts}, next in ~${outboxBackoffMs(newAttempts)}ms)`,
        );
      }
      return false;
    }
  }

  /** Start the background polling worker. */
  public startPolling(intervalMs = 5000): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    if (isOutboxDisabled()) {
      logger.info("[Outbox] Background polling disabled (benchmark/disabled mode)");
      return;
    }

    logger.info(`[Outbox] Starting background polling (interval: ${intervalMs}ms)`);
    this.pollInterval = setInterval(() => {
      this.processBatch().catch((err) => logger.error("[Outbox] Polling error", err));
    }, intervalMs);

    if (this.pollInterval && "unref" in this.pollInterval) {
      this.pollInterval.unref();
    }
  }

  /** Stop the background polling worker. */
  public stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      logger.info("[Outbox] Stopped background polling");
    }
  }

  /** Delete delivered events older than the given ISO timestamp. */
  public async cleanup(olderThan: string): Promise<DatabaseResult<{ deletedCount: number }>> {
    const db = getDb();
    if (!db) {
      return {
        success: false,
        message: "Database not available",
        error: { code: "OUTBOX_ERROR", message: "Database not available" },
      };
    }

    try {
      const result = await db.crud.deleteMany(
        this.collectionName,
        {
          status: "delivered",
          deliveredAt: { $lt: olderThan } as any,
        } as any,
        { permanent: true },
      );
      return result as DatabaseResult<{ deletedCount: number }>;
    } catch (error: any) {
      logger.error("[Outbox] Cleanup error:", error);
      return {
        success: false,
        message: error.message,
        error: { code: "OUTBOX_CLEANUP_FAILED", message: error.message },
      };
    }
  }

  /** Pending event count for health / monitoring. */
  public async getPendingCount(tenantId?: string): Promise<number> {
    const db = getDb();
    if (!db) return 0;

    const filter: Record<string, unknown> = { status: "pending" };
    if (tenantId) filter.tenantId = tenantId;

    try {
      const result = await db.crud.count(this.collectionName, filter as any);
      return result.success ? (result.data ?? 0) : 0;
    } catch {
      return 0;
    }
  }
}

// Singleton export
export const outboxService = new OutboxServiceImpl();
export type OutboxService = OutboxServiceImpl;
