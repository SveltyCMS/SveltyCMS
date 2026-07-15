/**
 * @file src/services/automation/automationService.ts
 * @description Core automation engine for SveltyCMS.
 * Manages automation flows (CRUD), executes operation chains,
 * and integrates with the EventBus and existing WebhookService.
 *
 * Features:
 * - Flow CRUD via systemPreferences (DB-agnostic)
 * - Operation executors: webhook, email, log, set_field, condition
 * - Token-aware payload resolution via replaceTokens()
 * - Execution logging with per-operation results
 * - Non-blocking async execution
 */

import { logger } from "@utils/logger";
import { generateUUID as uuidv4 } from "@utils/native-utils";
import { eventBus } from "./event-bus";
import type {
  AgenticTaskOperationConfig,
  AutomationEventPayload,
  AutomationFlow,
  AutomationOperation,
  ConditionOperationConfig,
  EmailOperationConfig,
  ExecutionLogEntry,
  ExecutionStatus,
  LogOperationConfig,
  SetFieldOperationConfig,
  WebhookOperationConfig,
} from "./types";

const getDbAdapter = async () => (await import("@src/databases/db")).dbAdapter;

/**
 * Singleton automation service.
 * Registers itself as a listener on the EventBus and manages flow persistence.
 */
export class AutomationService {
  // Per-tenant cache of flows
  private flowsCache: Map<string, { data: AutomationFlow[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60 * 1000; // 1 minute
  private initialized = false;

  /** Recent execution logs (in-memory ring buffer, max 100) */
  private executionLogs: ExecutionLogEntry[] = [];
  private readonly MAX_LOGS = 100;

  constructor() {}

  /**
   * Initialize the service: register wildcard listener on EventBus.
   * Safe to call multiple times (idempotent).
   */
  public init(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    eventBus.on("*", this.onAutomationEvent.bind(this));

    logger.info("⚡ AutomationService initialized — listening for events");
  }

  // ── Flow CRUD ──────────────────────────────────────────────

  /** Get all automation flows for a tenant */
  public async getFlows(tenantId: string): Promise<AutomationFlow[]> {
    if (!tenantId) {
      return [];
    }

    const cached = this.flowsCache.get(tenantId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const db = await getDbAdapter();
      if (!db || !db.system) {
        return [];
      }

      const result = await db.system.preferences.get<AutomationFlow[]>("automations_config", {
        scope: "system",
        tenantId: tenantId as any,
      });
      const flows = result.success && Array.isArray(result.data) ? result.data : [];

      // Enforce tenantId consistency
      const sanitizedFlows = flows.map((f) => ({ ...f, tenantId }));

      this.flowsCache.set(tenantId, {
        data: sanitizedFlows,
        timestamp: Date.now(),
      });
      return sanitizedFlows;
    } catch (e) {
      logger.error(`Failed to load automation flows for tenant ${tenantId}:`, e);
      return [];
    }
  }

  /** Get a single flow by ID for a tenant */
  public async getFlow(id: string, tenantId: string): Promise<AutomationFlow | null> {
    const flows = await this.getFlows(tenantId);
    return flows.find((f) => f.id === id) ?? null;
  }

  /** Create or update a flow for a tenant */
  public async saveFlow(flow: Partial<AutomationFlow>, tenantId: string): Promise<AutomationFlow> {
    if (!tenantId) {
      throw new Error("tenantId is required");
    }

    const db = await getDbAdapter();
    if (!db || !db.system) {
      throw new Error("Database or system not available");
    }

    const current = await this.getFlows(tenantId);
    const now = new Date().toISOString();

    const savedFlow: AutomationFlow = {
      id: flow.id || uuidv4(),
      name: flow.name || "Untitled Automation",
      description: flow.description || "",
      active: flow.active ?? true,
      trigger: flow.trigger || { type: "event", events: [] },
      operations: flow.operations || [],
      lastTriggered: flow.lastTriggered,
      triggerCount: flow.triggerCount ?? 0,
      failureCount: flow.failureCount ?? 0,
      createdAt: flow.createdAt || now,
      updatedAt: now,
      tenantId, // Ensure correct tenantId is set
    };

    let updated: AutomationFlow[];
    if (flow.id) {
      updated = current.map((f) => (f.id === flow.id ? savedFlow : f));
    } else {
      updated = [...current, savedFlow];
    }

    await db.system.preferences.set("automations_config", updated, {
      scope: "system",
      tenantId: tenantId as any,
    });

    // Update cache immediately
    this.flowsCache.set(tenantId, { data: updated, timestamp: Date.now() });

    // Prune cache if it grows too large (e.g. > 500 tenants) to prevent heap pressure
    if (this.flowsCache.size > 500) {
      const oldestKey = this.flowsCache.keys().next().value;
      if (oldestKey) this.flowsCache.delete(oldestKey);
    }

    return savedFlow;
  }

  /** Delete a flow by ID for a tenant */
  public async deleteFlow(id: string, tenantId: string): Promise<void> {
    if (!tenantId) {
      return;
    }

    const db = await getDbAdapter();
    if (!db || !db.system) {
      return;
    }

    const current = await this.getFlows(tenantId);
    const initialLength = current.length;
    const updated = current.filter((f) => f.id !== id);

    if (updated.length !== initialLength) {
      await db.system.preferences.set("automations_config", updated, {
        scope: "system",
        tenantId: tenantId as any,
      });
      this.flowsCache.set(tenantId, { data: updated, timestamp: Date.now() });
    }
  }

  /** Duplicate a flow for a tenant */
  public async duplicateFlow(id: string, tenantId: string): Promise<AutomationFlow> {
    const flow = await this.getFlow(id, tenantId);
    if (!flow) {
      throw new Error("Flow not found");
    }

    return this.saveFlow(
      {
        ...flow,
        id: undefined,
        name: `${flow.name} (Copy)`,
        active: false,
        triggerCount: 0,
        failureCount: 0,
      },
      tenantId,
    );
  }

  // ── Event Handling ─────────────────────────────────────────

  /** Wildcard listener for EventBus */
  private async onAutomationEvent(payload: AutomationEventPayload): Promise<void> {
    await this.handleEvent(payload);
  }

  /** Handle an incoming event: find matching flows and execute */
  private async handleEvent(payload: AutomationEventPayload): Promise<void> {
    if (!payload.tenantId) {
      logger.warn(`AutomationService: Event ${payload.event} received without tenantId`);
      return;
    }

    const flows = await this.getFlows(payload.tenantId);
    const matchingFlows = flows.filter((flow) => {
      if (!flow.active) {
        return false;
      }
      if (flow.trigger.type !== "event") {
        return false;
      }
      if (!flow.trigger.events?.includes(payload.event)) {
        return false;
      }

      // Collection filter: if specified, entry must match
      if (
        flow.trigger.collections &&
        flow.trigger.collections.length > 0 &&
        payload.collection &&
        !flow.trigger.collections.includes(payload.collection)
      ) {
        return false;
      }

      return true;
    });

    if (matchingFlows.length === 0) {
      return;
    }

    logger.debug(
      `AutomationService: ${payload.event} matched ${matchingFlows.length} flows for tenant ${payload.tenantId}`,
    );

    // Execute matching flows in parallel (non-blocking)
    for (const flow of matchingFlows) {
      this.executeFlow(flow, payload).catch((err) =>
        logger.error(`Automation flow "${flow.name}" execution error:`, err),
      );
    }
  }

  /** Execute a flow's operation chain */
  public async executeFlow(
    flow: AutomationFlow,
    payload: AutomationEventPayload,
  ): Promise<ExecutionLogEntry> {
    const startTime = Date.now();
    const logEntry: ExecutionLogEntry = {
      id: uuidv4(),
      automationId: flow.id,
      automationName: flow.name,
      event: payload.event,
      status: "success",
      operationResults: [],
      duration: 0,
      timestamp: new Date().toISOString(),
      triggerPayload: this.sanitizePayload(payload),
      tenantId: flow.tenantId,
    };

    for (const operation of flow.operations) {
      const opStart = Date.now();
      try {
        const result = await this.executeOperation(operation, payload);

        logEntry.operationResults.push({
          operationId: operation.id,
          type: operation.type,
          status: result ? "success" : "skipped",
          duration: Date.now() - opStart,
        });

        // If condition returned false, stop chain
        if (result === false) {
          logEntry.status = "skipped";
          break;
        }
      } catch (err: any) {
        const errorMsg = err.message;
        logEntry.operationResults.push({
          operationId: operation.id,
          type: operation.type,
          status: "failure",
          duration: Date.now() - opStart,
          error: errorMsg,
        });

        logEntry.status = "failure";
        if (operation.stopOnError !== false) {
          break; // Default: stop chain on error
        }
      }
    }

    logEntry.duration = Date.now() - startTime;

    // Update flow stats (fire-and-forget)
    this.updateFlowStats(flow.id, logEntry.status, flow.tenantId).catch(() => {
      logger.debug("Flow stats update failed silently");
    });

    // Store log entry
    this.addLogEntry(logEntry);

    return logEntry;
  }

  // ── Operation Executors ────────────────────────────────────

  /**
   * Execute a single operation.
   * Returns true for success, false for condition-not-met (skip rest).
   */
  private async executeOperation(
    operation: AutomationOperation,
    payload: AutomationEventPayload,
  ): Promise<boolean> {
    const resolvedConfig = await this.resolveTokensInConfig(
      operation.config as unknown as Record<string, unknown>,
      payload,
    );

    switch (operation.type) {
      case "webhook":
        await this.executeWebhook(resolvedConfig as unknown as WebhookOperationConfig, payload);
        return true;

      case "email":
        await this.executeEmail(resolvedConfig as unknown as EmailOperationConfig, payload);
        return true;

      case "log":
        this.executeLog(resolvedConfig as unknown as LogOperationConfig);
        return true;

      case "set_field":
        await this.executeSetField(resolvedConfig as unknown as SetFieldOperationConfig, payload);
        return true;

      case "condition":
        return this.evaluateCondition(
          resolvedConfig as unknown as ConditionOperationConfig,
          payload,
        );

      case "agentic_task":
        await this.executeAgenticTask(
          resolvedConfig as unknown as AgenticTaskOperationConfig,
          payload,
        );
        return true;

      default:
        logger.warn(`Unknown operation type: ${operation.type}`);
        return true;
    }
  }

  /** Execute a webhook operation */
  private async executeWebhook(
    config: WebhookOperationConfig,
    payload: AutomationEventPayload,
  ): Promise<void> {
    const { isBenchmarkExternalServicesDisabled } = await import("@utils/benchmark-runtime");
    if (isBenchmarkExternalServicesDisabled()) {
      logger.debug(`[Automation] Skipped webhook to ${config.url} (benchmark mode)`);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s timeout

    const body = config.body || JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "SveltyCMS-Automation/1.0",
      "X-SveltyCMS-Event": payload.event,
      "X-SveltyCMS-Tenant": payload.tenantId,
      ...config.headers,
    };

    // HMAC signature if secret provided
    if (config.secret) {
      const crypto = await import("node:crypto");
      const signature = crypto.createHmac("sha256", config.secret).update(body).digest("hex");
      headers["X-SveltyCMS-Signature"] = `sha256=${signature}`;
    }

    try {
      const response = await fetch(config.url, {
        method: config.method || "POST",
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Webhook returned HTTP ${response.status}`);
      }

      logger.debug(`Automation webhook sent to ${config.url} for tenant ${payload.tenantId}`);
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  /** Execute an email operation */
  private async executeEmail(
    config: EmailOperationConfig,
    _payload: AutomationEventPayload,
  ): Promise<void> {
    const { isBenchmarkExternalServicesDisabled } = await import("@utils/benchmark-runtime");
    if (isBenchmarkExternalServicesDisabled()) {
      logger.debug(`[Automation] Skipped email to ${config.to} (benchmark mode)`);
      return;
    }

    // Use the core email server utility
    try {
      const { sendMail } = await import("@utils/email.server");
      await sendMail({
        recipientEmail: config.to,
        subject: config.subject,
        templateName: "customEmail", // Using a generic template if needed, or we might need to adjust how custom bodies are handled
        props: {
          body: config.body,
        },
      });
      logger.info(`Automation email sent to ${config.to}: "${config.subject}"`);
    } catch (err) {
      logger.error("Automation email failed:", err);
      throw err;
    }
  }

  /** Execute a log operation */
  private executeLog(config: LogOperationConfig): void {
    const level = config.level || "info";
    logger[level](`[Automation] ${config.message}`);
  }

  /** Execute a set_field operation */
  private async executeSetField(
    config: SetFieldOperationConfig,
    payload: AutomationEventPayload,
  ): Promise<void> {
    if (!(payload.entryId && payload.collection)) {
      logger.warn("set_field: No entry context available");
      return;
    }

    const db = await getDbAdapter();
    if (!db) {
      throw new Error("Database not available");
    }

    // Update the field on the entry
    await db.crud.update(
      payload.collection,
      payload.entryId as any,
      {
        [config.field]: config.value,
      },
      payload.tenantId as any,
    );

    logger.debug(
      `Automation set_field: ${config.field} = ${config.value} on ${payload.entryId} (tenant: ${payload.tenantId})`,
    );
  }

  /** Evaluate a condition operation */
  private evaluateCondition(
    config: ConditionOperationConfig,
    payload: AutomationEventPayload,
  ): boolean {
    const fieldValue = payload.data?.[config.field];

    switch (config.operator) {
      case "equals":
        return String(fieldValue) === config.value;
      case "not_equals":
        return String(fieldValue) !== config.value;
      case "contains":
        return String(fieldValue ?? "").includes(config.value ?? "");
      case "not_contains":
        return !String(fieldValue ?? "").includes(config.value ?? "");
      case "exists":
        return fieldValue !== undefined && fieldValue !== null && fieldValue !== "";
      case "not_exists":
        return fieldValue === undefined || fieldValue === null || fieldValue === "";
      default:
        return true;
    }
  }

  /** Execute an agentic task operation via local AIService (privacy-first) */
  private async executeAgenticTask(
    config: AgenticTaskOperationConfig,
    payload: AutomationEventPayload,
  ): Promise<void> {
    const { aiService } = await import("@src/services/core/ai-service");

    const sourceText =
      config.prompt ||
      (payload.data
        ? Object.values(payload.data)
            .filter((v) => typeof v === "string")
            .join("\n")
        : "");

    if (!sourceText) {
      logger.warn("Agentic task: No source text available to process");
      return;
    }

    let result: string;

    switch (config.taskType) {
      case "summarize":
        result = await aiService.process("Summarize this content concisely.", sourceText);
        break;

      case "translate":
        result = await aiService.translate(sourceText, "auto", config.targetLanguage || "en");
        break;

      case "enrich":
        result = await aiService.enrichText(sourceText, "rewrite");
        break;

      case "classify":
        result = await aiService.process(
          "Classify this content into one of these categories: news, tutorial, reference, opinion, announcement. Return only the category name.",
          sourceText,
        );
        break;

      case "generate_tags":
        result = await aiService.process(
          "Generate 5 descriptive, comma-separated tags for this content. Return only the tags.",
          sourceText,
        );
        break;

      default:
        logger.warn(`Agentic task: Unknown task type: ${config.taskType}`);
        return;
    }

    logger.info(`Agentic task (${config.taskType}) completed for tenant ${payload.tenantId}`);

    // Optionally write result back to the entry
    if (config.targetField && payload.entryId && payload.collection) {
      const db = await getDbAdapter();
      if (db) {
        await db.crud.update(
          payload.collection,
          payload.entryId as any,
          { [config.targetField]: result },
          payload.tenantId as any,
        );
        logger.debug(`Agentic task: Wrote result to ${config.targetField} on ${payload.entryId}`);
      }
    }
  }

  // ── Token Resolution ───────────────────────────────────────

  /** Resolve {{ tokens }} in operation config values */
  private async resolveTokensInConfig(
    config: Record<string, unknown>,
    payload: AutomationEventPayload,
  ): Promise<Record<string, unknown>> {
    try {
      const { replaceTokens } = await import("@src/services/token/engine");

      const context = {
        entry: payload.data || {},
        user: {
          ...payload.user,
          _id: payload.user?._id || "",
          email: payload.user?.email || "system@automation",
          role: "guest",
          permissions: [],
        } as any,
        system: { now: payload.timestamp as any },
        // Automation-specific context
        trigger: {
          event: payload.event,
          collection: payload.collection,
          entryId: payload.entryId,
          timestamp: payload.timestamp,
          previous: payload.previousData || {},
          tenantId: payload.tenantId,
        },
      } as any;

      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(config)) {
        if (typeof value === "string" && value.includes("{{")) {
          resolved[key] = await replaceTokens(value, context);
        } else {
          resolved[key] = value;
        }
      }

      return resolved;
    } catch {
      // Token resolution unavailable, using raw config
      logger.debug("Token resolution unavailable, using raw config");
      return config;
    }
  }

  // ── Stats & Logging ────────────────────────────────────────

  private async updateFlowStats(
    flowId: string,
    status: ExecutionStatus,
    tenantId: string,
  ): Promise<void> {
    const cached = this.flowsCache.get(tenantId);
    if (!cached) {
      return;
    }

    const flow = cached.data.find((f) => f.id === flowId);
    if (flow) {
      flow.lastTriggered = new Date().toISOString();
      flow.triggerCount = (flow.triggerCount || 0) + 1;
      if (status === "failure") {
        flow.failureCount = (flow.failureCount || 0) + 1;
      }

      // Persist stats update
      const db = await getDbAdapter();
      if (db && db.system) {
        await db.system.preferences
          .set("automations_config", cached.data, {
            scope: "system",
            tenantId: tenantId as any,
          })
          .catch(() => {
            logger.debug("Automation config persistence failed silently");
          });
      }
    }
  }

  private addLogEntry(entry: ExecutionLogEntry): void {
    this.executionLogs.unshift(entry);
    if (this.executionLogs.length > this.MAX_LOGS) {
      this.executionLogs.pop(); // Faster than slice(0, MAX_LOGS)
    }
  }

  /**
   * Sanitizes the payload to prevent memory leaks from large document snapshots.
   * Truncates strings over 5KB and limits nested object depth.
   */
  private sanitizePayload(payload: any, depth = 0): any {
    if (depth > 3 || payload === null || typeof payload !== "object") {
      return payload;
    }

    if (Array.isArray(payload)) {
      return payload.slice(0, 10).map((item) => this.sanitizePayload(item, depth + 1));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === "string") {
        // Truncate large strings (e.g. base64 images or massive text fields)
        sanitized[key] = value.length > 5120 ? value.substring(0, 5120) + "... [Truncated]" : value;
      } else if (typeof value === "object") {
        sanitized[key] = this.sanitizePayload(value, depth + 1);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /** Get recent execution logs (optionally filtered by automation ID and tenant) */
  public getLogs(automationId?: string, tenantId?: string): ExecutionLogEntry[] {
    let logs = this.executionLogs;
    if (tenantId) {
      logs = logs.filter((l) => l.tenantId === tenantId);
    }
    if (automationId) {
      logs = logs.filter((l) => l.automationId === automationId);
    }
    return logs;
  }

  /** Clear flow cache (force reload on next access) */
  public invalidateCache(tenantId?: string): void {
    if (tenantId) {
      this.flowsCache.delete(tenantId);
    } else {
      this.flowsCache.clear();
    }
  }
}

export const automationService = new AutomationService();
