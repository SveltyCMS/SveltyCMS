/**
 * @file src/services/webhook-service.ts
 * @description Service for managing and dispatching system webhooks with tenant isolation.
 */

import { logger } from "@utils/logger";
import { generateUUID } from "@utils/native-utils";
import { dbAdapter } from "@src/databases/db";
import type { Job } from "@src/databases/db-interface";
import { isBenchmarkExternalServicesDisabled } from "@utils/benchmark-runtime";
import { jobQueue } from "./jobs/job-queue-service";
import { webhookDeliveryHandler } from "./jobs/webhook-jobs";
import { auditLogService, AuditEventType } from "@src/services/security/audit-service";

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  tenantId: string;
  secret?: string;
  headers?: Record<string, string>;
  failureCount?: number;
  lastTriggered?: string;
}

/**
 * One row of the delivery log / Dead-Letter Queue shown in the admin UI.
 *
 * A projection of the durable `webhook-delivery` job (never the full job): the
 * job payload contains the tenant's event body, which must not reach the
 * browser just to render a name and an error line.
 */
export interface WebhookDeliveryLog {
  _id: string;
  attempts: number;
  createdAt: string;
  event: string;
  lastError?: string;
  maxAttempts: number;
  status: Job["status"];
  updatedAt: string;
  webhookId: string;
  webhookName: string;
}

/** Subset of job statuses the logs UI can filter on. */
const DELIVERY_LOG_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "running",
  "completed",
  "failed",
]);

/** Maps a queued `webhook-delivery` job onto the public log shape. */
function toDeliveryLog(job: Job): WebhookDeliveryLog {
  const payload = (job.payload ?? {}) as {
    event?: unknown;
    webhook?: { id?: unknown; name?: unknown };
  };
  return {
    _id: String(job._id),
    webhookId: String(payload.webhook?.id ?? ""),
    webhookName: String(payload.webhook?.name ?? "Webhook"),
    event: String(payload.event ?? ""),
    status: job.status,
    attempts: job.attempts ?? 0,
    maxAttempts: job.maxAttempts ?? 3,
    lastError: job.lastError,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export type WebhookEvent =
  | "*"
  | "entry:create"
  | "entry:update"
  | "entry:delete"
  | "entry:publish"
  | "entry:unpublish"
  | "media:upload"
  | "media:delete"
  // Config promotion events
  | "config.exported"
  | "config.plan.created"
  | "config.applied"
  // Content package events
  | "content.exported"
  | "content.import.started"
  | "content.import.completed"
  // Backup events
  | "backup.created"
  | "backup.restore.started"
  | "backup.restore.completed"
  // Migration events
  | "migration.applied"
  | "migration.verified"
  | "migration.failed"
  // Content sync events
  | "content.sync.started"
  | "content.sync.completed";

const WEBHOOK_SERVICE_KEY = "__WEBHOOK_SERVICE_INSTANCE__";

export class WebhookService {
  // In-memory cache: tenantId → { data, timestamp }
  private readonly webhooksCache = new Map<string, { data: Webhook[]; timestamp: number }>();

  private readonly CACHE_TTL = 60 * 1000; // 1 minute

  private constructor() {}

  public static getInstance(): WebhookService {
    let inst = (globalThis as any)[WEBHOOK_SERVICE_KEY];
    if (!inst) {
      inst = new WebhookService();
      (globalThis as any)[WEBHOOK_SERVICE_KEY] = inst;
    }
    return inst;
  }

  /**
   * Trigger an event for a specific tenant (non-blocking)
   */
  public async trigger(event: WebhookEvent, payload: unknown, tenantId: string): Promise<void> {
    if (isBenchmarkExternalServicesDisabled()) {
      logger.debug(`[Webhook] Skipped trigger ${event} (benchmark mode)`);
      return;
    }
    const tid = tenantId || "global";

    // Fire and forget – don't block the caller
    this._dispatch(event, payload, tid).catch((err) => {
      logger.error(`Error dispatching webhook event ${event} for tenant ${tid}:`, err);
    });
  }

  /**
   * Send a test event to a specific webhook (used by admin UI)
   */
  public async testWebhook(id: string, userEmail: string, tenantId?: string): Promise<void> {
    const tid = tenantId || "global";
    const webhooks = await this.getWebhooks(tid);
    const webhook = webhooks.find((w) => w.id === id);

    if (!webhook) {
      throw new Error(`Webhook with id "${id}" not found for tenant ${tid}`);
    }

    await this._dispatchTo(webhook, "entry:create", {
      test: true,
      message: "This is a test event from SveltyCMS",
      triggeredBy: userEmail,
    });
  }

  /**
   * Queue one delivery to a specific webhook (no configured-webhook lookup).
   * Automation flows use this so their deliveries share the durable
   * `webhook-delivery` job, retry/backoff and the logs page with
   * admin-configured webhooks.
   */
  public async dispatchDelivery(
    webhook: Webhook,
    event: string,
    payload: unknown,
    options: { body?: string; method?: string; allowHttp?: boolean } = {},
  ): Promise<void> {
    if (isBenchmarkExternalServicesDisabled()) {
      logger.debug(`[Webhook] Skipped delivery ${event} (benchmark mode)`);
      return;
    }
    const tid = webhook.tenantId || "global";
    await jobQueue.dispatch("webhook-delivery", { webhook, event, payload, ...options }, tid);
  }

  /**
   * Internal dispatch – finds matching webhooks and queues them
   */
  private async _dispatch(event: WebhookEvent, payload: unknown, tenantId?: string): Promise<void> {
    const tid = tenantId || "global";
    const webhooks = await this.getWebhooks(tid);

    const matchingHooks = webhooks.filter(
      (wh) => wh.active && (wh.events.includes(event) || wh.events.includes("*" as WebhookEvent)),
    );

    if (matchingHooks.length === 0) {
      return;
    }

    logger.debug(`Queueing ${event} for ${matchingHooks.length} webhooks (tenant: ${tid})`);

    for (const webhook of matchingHooks) {
      await this.dispatchDelivery(webhook, event, payload);
    }
  }

  /**
   * Immediate delivery (used for testWebhook)
   */
  private async _dispatchTo(
    webhook: Webhook,
    event: WebhookEvent,
    payload: unknown,
  ): Promise<void> {
    await webhookDeliveryHandler({ webhook, event, payload });
  }

  /**
   * Get webhooks for a tenant with caching
   */
  public async getWebhooks(tenantId?: string): Promise<Webhook[]> {
    const tid = tenantId || "global";

    const cached = this.webhooksCache.get(tid);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const db = dbAdapter;
      if (!db?.system?.preferences) {
        logger.warn(`Database adapter not available for webhooks (tenant: ${tid})`);
        return [];
      }

      const result = await db.system.preferences.get<Webhook[]>("webhooks_config", {
        scope: "system",
        tenantId: tid as any,
      });

      const webhooks = result.success && Array.isArray(result.data) ? result.data : [];

      // Enforce tenantId (defense in depth)
      const sanitized = webhooks.map((w) => ({ ...w, tenantId: tid }));

      if (this.webhooksCache.size >= 500) {
        const oldestKey = this.webhooksCache.keys().next().value;
        if (oldestKey) this.webhooksCache.delete(oldestKey);
      }

      this.webhooksCache.set(tid, {
        data: sanitized,
        timestamp: Date.now(),
      });

      return sanitized;
    } catch (err) {
      logger.error(`Failed to load webhooks for tenant ${tid}:`, err);
      return [];
    }
  }

  /**
   * Save or update a webhook for a tenant
   */
  public async saveWebhook(partial: Partial<Webhook>, tenantId?: string): Promise<Webhook> {
    const tid = tenantId || "global";

    const db = dbAdapter;
    if (!db?.system?.preferences) {
      throw new Error("Database adapter not available");
    }

    const current = await this.getWebhooks(tid);
    const existing = partial.id ? current.find((w) => w.id === partial.id) : undefined;

    const newWebhook: Webhook = {
      id: partial.id || generateUUID(),
      name: partial.name || "Untitled Webhook",
      url: partial.url || "",
      events: partial.events || [],
      active: partial.active ?? true,
      tenantId: tid,
      // 🛡️ SECURITY: an update that omits `secret`/`headers` must not wipe the HMAC
      // secret (which would silently disable signature verification) or the custom
      // auth headers — merge with the existing webhook.
      secret: partial.secret ?? existing?.secret,
      headers: partial.headers ?? existing?.headers,
      failureCount: partial.failureCount ?? existing?.failureCount ?? 0,
    };

    let updated: Webhook[];

    if (partial.id && current.some((w) => w.id === partial.id)) {
      // Update existing
      updated = current.map((w) => (w.id === partial.id ? newWebhook : w));
    } else {
      // Create new
      updated = [...current, newWebhook];
    }

    await db.system.preferences.set("webhooks_config", updated, {
      scope: "system",
      tenantId: tid as any,
    });

    // Update cache immediately
    this.webhooksCache.set(tid, { data: updated, timestamp: Date.now() });

    return newWebhook;
  }

  /**
   * Delete a webhook by ID for a tenant
   */
  public async deleteWebhook(id: string, tenantId?: string): Promise<void> {
    const tid = tenantId || "global";

    const db = dbAdapter;
    if (!db?.system?.preferences) return;

    const current = await this.getWebhooks(tid);
    const updated = current.filter((w) => w.id !== id);

    if (updated.length !== current.length) {
      await db.system.preferences.set("webhooks_config", updated, {
        scope: "system",
        tenantId: tid as any,
      });

      // Update cache
      this.webhooksCache.set(tid, {
        data: updated,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Clear cache for a tenant (useful after bulk operations)
   */
  public clearCache(tenantId?: string): void {
    if (tenantId) {
      this.webhooksCache.delete(tenantId);
    } else {
      this.webhooksCache.clear();
    }
  }

  // Logs
  public async getWebhookLogs(webhookId: string, tenantId: string) {
    const result = await auditLogService.queryLogs({
      tenantId,
      targetId: webhookId as any,
      eventTypes: [AuditEventType.WEBHOOK_TRIGGERED],
    });
    return result.success ? result.data : [];
  }

  /**
   * Delivery log / Dead-Letter Queue for one tenant.
   *
   * Deliveries are tracked by the durable job queue (`webhook-delivery` rows),
   * which is exactly the data the logs page renders — attempts, last error and
   * retry state. The audit ledger only records webhook *configuration* changes,
   * so querying it here produced a permanently empty list.
   */
  public async getTenantLogs(
    tenantId: string,
    options: { limit?: number; status?: string } = {},
  ): Promise<WebhookDeliveryLog[]> {
    const tid = tenantId || "global";
    const db = dbAdapter;
    if (!db?.system?.jobs) {
      logger.warn(`Database adapter not available for webhook logs (tenant: ${tid})`);
      return [];
    }

    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const status =
      options.status && DELIVERY_LOG_STATUSES.has(options.status) ? options.status : undefined;

    try {
      const result = await db.system.jobs.list({
        taskType: "webhook-delivery",
        limit,
        tenantId: tid as any,
        ...(status ? { status } : {}),
      });
      if (!result.success || !Array.isArray(result.data)) return [];
      return result.data.map(toDeliveryLog);
    } catch (err) {
      logger.error(`Failed to load webhook deliveries for tenant ${tid}:`, err);
      return [];
    }
  }

  /**
   * Requeues a failed delivery (DLQ → pending) so the job queue retries it.
   * Tenant-scoped: a job id from another tenant is reported as not found.
   */
  public async retryDelivery(jobId: string, tenantId: string): Promise<void> {
    const tid = tenantId || "global";
    const db = dbAdapter;
    if (!db?.system?.jobs) {
      throw new Error("Database adapter not available");
    }

    const found = await db.system.jobs.getById(jobId as any, { tenantId: tid as any });
    const job = found.success ? found.data : null;
    if (!job || job.taskType !== "webhook-delivery" || String(job.tenantId ?? "") !== tid) {
      throw new Error(`Webhook delivery ${jobId} not found`);
    }

    const updated = await db.system.jobs.update(
      jobId as any,
      {
        attempts: 0,
        lastError: "",
        nextRunAt: new Date(),
        progress: 0,
        status: "pending",
      },
      { tenantId: tid as any },
    );
    if (!updated.success) {
      throw new Error(updated.message || "Failed to requeue webhook delivery");
    }

    // Same immediate kick as `jobQueue.dispatch()` — the poller would pick the
    // job up within 10 s, but the operator expects the row to move now.
    void jobQueue.processNextBatch();
  }
}

// Singleton export
export const webhookService = WebhookService.getInstance();
