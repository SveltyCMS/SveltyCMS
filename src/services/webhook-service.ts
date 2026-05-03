/**
 * @file src/services/webhook-service.ts
 * @description Service for managing and dispatching system webhooks with tenant isolation.
 */

import { logger } from "@utils/logger";
import { generateUUID } from "@utils/native-utils";
import { auditLogService, AuditEventType } from "./audit-log-service";

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
  | "media:delete";

const getDbAdapter = async () => (await import("@src/databases/db")).dbAdapter;

export class WebhookService {
  private static instance: WebhookService | null = null;

  // In-memory cache: tenantId → { data, timestamp }
  private readonly webhooksCache = new Map<string, { data: Webhook[]; timestamp: number }>();

  private readonly CACHE_TTL = 60 * 1000; // 1 minute

  private constructor() {}

  public static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService();
    }
    return WebhookService.instance;
  }

  /**
   * Trigger an event for a specific tenant (non-blocking)
   */
  public async trigger(event: WebhookEvent, payload: unknown, tenantId: string): Promise<void> {
    if (!tenantId) {
      if (process.env.TEST_MODE !== "true") {
        logger.warn(`Webhook trigger called without tenantId for event: ${event}`);
      } else {
        logger.debug(`Webhook trigger called without tenantId for event: ${event}`);
      }
      return;
    }

    // Fire and forget – don't block the caller
    this._dispatch(event, payload, tenantId).catch((err) => {
      logger.error(`Error dispatching webhook event ${event} for tenant ${tenantId}:`, err);
    });
  }

  /**
   * Send a test event to a specific webhook (used by admin UI)
   */
  public async testWebhook(id: string, userEmail: string, tenantId: string): Promise<void> {
    const webhooks = await this.getWebhooks(tenantId);
    const webhook = webhooks.find((w) => w.id === id);

    if (!webhook) {
      throw new Error(`Webhook with id "${id}" not found for tenant ${tenantId}`);
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
  private async _dispatch(event: WebhookEvent, payload: unknown, tenantId: string): Promise<void> {
    const webhooks = await this.getWebhooks(tenantId);

    const matchingHooks = webhooks.filter(
      (wh) => wh.active && (wh.events.includes(event) || wh.events.includes("*" as WebhookEvent)),
    );

    if (matchingHooks.length === 0) {
      return;
    }

    logger.debug(`Queueing ${event} for ${matchingHooks.length} webhooks (tenant: ${tenantId})`);

    const { jobQueue } = await import("./jobs/job-queue-service");

    for (const webhook of matchingHooks) {
      await jobQueue.dispatch("webhook-delivery", { webhook, event, payload }, tenantId);
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
    const { webhookDeliveryHandler } = await import("./jobs/webhook-jobs");
    await webhookDeliveryHandler({ webhook, event, payload });
  }

  /**
   * Get webhooks for a tenant with caching
   */
  public async getWebhooks(tenantId: string): Promise<Webhook[]> {
    if (!tenantId) return [];

    const cached = this.webhooksCache.get(tenantId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const db = await getDbAdapter();
      if (!db?.system?.preferences) {
        logger.warn(`Database adapter not available for webhooks (tenant: ${tenantId})`);
        return [];
      }

      const result = await db.system.preferences.get<Webhook[]>(
        "webhooks_config",
        "system",
        tenantId as any,
      );

      const webhooks = result.success && Array.isArray(result.data) ? result.data : [];

      // Enforce tenantId (defense in depth)
      const sanitized = webhooks.map((w) => ({ ...w, tenantId }));

      this.webhooksCache.set(tenantId, {
        data: sanitized,
        timestamp: Date.now(),
      });

      return sanitized;
    } catch (err) {
      logger.error(`Failed to load webhooks for tenant ${tenantId}:`, err);
      return [];
    }
  }

  /**
   * Save or update a webhook for a tenant
   */
  public async saveWebhook(partial: Partial<Webhook>, tenantId: string): Promise<Webhook> {
    if (!tenantId) {
      throw new Error("tenantId is required to save webhook");
    }

    const db = await getDbAdapter();
    if (!db?.system?.preferences) {
      throw new Error("Database adapter not available");
    }

    const current = await this.getWebhooks(tenantId);

    const newWebhook: Webhook = {
      id: partial.id || generateUUID(),
      name: partial.name || "Untitled Webhook",
      url: partial.url || "",
      events: partial.events || [],
      active: partial.active ?? true,
      tenantId,
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

    await db.system.preferences.set("webhooks_config", updated, "system", tenantId as any);

    // Update cache immediately
    this.webhooksCache.set(tenantId, { data: updated, timestamp: Date.now() });

    return newWebhook;
  }

  /**
   * Delete a webhook by ID for a tenant
   */
  public async deleteWebhook(id: string, tenantId: string): Promise<void> {
    if (!tenantId) return;

    const db = await getDbAdapter();
    if (!db?.system?.preferences) return;

    const current = await this.getWebhooks(tenantId);
    const updated = current.filter((w) => w.id !== id);

    if (updated.length !== current.length) {
      await db.system.preferences.set("webhooks_config", updated, "system", tenantId as any);

      // Update cache
      this.webhooksCache.set(tenantId, { data: updated, timestamp: Date.now() });
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
