/**
 * @file src/services/webhook-service.ts
 * @description Service for managing and dispatching system webhooks with tenant isolation.
 */

import { logger } from "@utils/logger";
import { generateUUID } from "@utils/native-utils";
import { dbAdapter } from "@src/databases/db";
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
      await jobQueue.dispatch("webhook-delivery", { webhook, event, payload }, tid);
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

    const newWebhook: Webhook = {
      id: partial.id || generateUUID(),
      name: partial.name || "Untitled Webhook",
      url: partial.url || "",
      events: partial.events || [],
      active: partial.active ?? true,
      tenantId: tid,
      secret: partial.secret,
      headers: partial.headers,
      failureCount: partial.failureCount ?? 0,
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

  public async getTenantLogs(tenantId: string, limit = 50) {
    const result = await auditLogService.queryLogs({
      tenantId,
      eventTypes: [AuditEventType.WEBHOOK_TRIGGERED],
      limit,
    });
    return result.success ? result.data : [];
  }
}

// Singleton export
export const webhookService = WebhookService.getInstance();
