/**
 * @file src/services/jobs/webhook-jobs.ts
 * @description Job handler for durable webhook delivery with Dead-Letter Queue (DLQ) logic.
 */

import crypto from "node:crypto";
import { generateUUID } from "@utils/native-utils";
import { logger } from "@utils/logger.server";
import type { Webhook, WebhookEvent } from "@src/services/webhook-service";

export interface WebhookJobPayload {
  webhook: Webhook;
  event: WebhookEvent;
  payload: unknown;
}

/**
 * Handler for 'webhook-delivery' tasks.
 * Implements status-aware retry logic to prevent "Poison Pill" loops.
 */
export async function webhookDeliveryHandler(jobPayload: WebhookJobPayload) {
  const { webhook, event, payload } = jobPayload;

  const payloadStr = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    payload,
    webhookId: webhook.id,
    deliveryId: generateUUID(),
    tenantId: webhook.tenantId,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-SveltyCMS-Event": event,
    "X-SveltyCMS-Delivery": generateUUID(),
    "X-SveltyCMS-Timestamp": Math.floor(Date.now() / 1000).toString(),
    "User-Agent": "SveltyCMS-Webhook/1.0 (JobQueue)",
    ...webhook.headers,
  };

  // Calculate signature if secret exists
  if (webhook.secret) {
    const signature = crypto.createHmac("sha256", webhook.secret).update(payloadStr).digest("hex");
    headers["X-SveltyCMS-Signature"] = `sha256=${signature}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for jobs

    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: payloadStr,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      logger.info(`[WebhookJob] Successfully delivered ${event} to ${webhook.name}`);
      return;
    }

    // --- STATUS-AWARE ERROR HANDLING ---
    const status = response.status;

    // 1. RETRYABLE ERRORS (5xx, 429, 408)
    if (status >= 500 || status === 429 || status === 408) {
      throw new Error(`RETRYABLE_ERROR: HTTP ${status} from ${webhook.url}`);
    }

    // 2. POISON PILLS (400, 401, 403, 404, etc.)
    // These will never succeed on retry (e.g. invalid API key, wrong URL).
    // We throw a special error that the JobQueue should recognize as PERMANENT.
    throw new Error(`PERMANENT_FAILURE: HTTP ${status} - Routing to DLQ.`);
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);

    // If it's a network timeout or connection refused, it's retryable
    if (errMessage.includes("aborted") || errMessage.includes("fetch failed")) {
      throw new Error(`RETRYABLE_ERROR: Network failure - ${errMessage}`);
    }

    throw error; // Re-throw for JobQueue to handle
  }
}
