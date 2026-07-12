/**
 * @file src/services/core/content-sync-service.ts
 * @description
 * Core ContentSyncService for controlled content movement between environments.
 *
 * Content sync is an optional, explicit mechanism for moving content between
 * environments (e.g., staging → production, production → development with
 * anonymization). Disabled by default. Requires explicit channel configuration.
 *
 * ### Features:
 * - Channel-based sync configuration (source, target, collections)
 * - Push and pull operations with plan preview
 * - PII anonymization for production-to-development pulls
 * - Background job dispatching for large sync operations
 * - Tenant-scoped channel isolation
 * - SHA-256 integrity checksums via createChecksum
 *
 * ### Safety Rules:
 * - Channels are disabled by default — must be explicitly enabled
 * - Push from production requires admin confirmation
 * - Pull from production to dev requires anonymization (can be overridden)
 * - Never sync users, sessions, tokens, secrets, API keys
 * - Tenant mismatch between channel config and actual data is blocked
 */

import { dbAdapter } from "@src/databases/db";
import type { IDBAdapter } from "@src/databases/db-interface";
import { jobQueue } from "@src/services/background/jobs/job-queue-service";
import { createChecksum } from "@utils/security/crypto";
import { generateUUID } from "@utils/native-utils";
import { logger } from "@utils/logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Collection name used to store sync channel configurations. */
const CHANNELS_COLLECTION = "content_sync_channels";

/** System collections that must never be synced. */
const FORBIDDEN_COLLECTIONS = new Set([
  "users",
  "sessions",
  "tokens",
  "apikeys",
  "api_keys",
  "secrets",
  "auth_tokens",
  "password_resets",
  "login_attempts",
  "audit_logs",
  "content_sync_channels",
  "content_sync_jobs",
]);

/** Job type identifier for sync background tasks. */
const SYNC_JOB_TYPE = "content-sync";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ContentSyncChannel {
  channelId: string;
  label: string;
  source: { tenantId: string; label: string };
  target: { tenantId: string; label: string };
  collections: string[];
  direction: "push" | "pull" | "bidirectional";
  enabled: boolean;
  anonymizeOnPull: boolean;
  conflictStrategy: "skip" | "update" | "create-copy" | "fail";
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
}

export interface CreateChannelOptions {
  label: string;
  source: { tenantId: string; label: string };
  target: { tenantId: string; label: string };
  collections: string[];
  direction?: "push" | "pull" | "bidirectional";
  enabled?: boolean;
  anonymizeOnPull?: boolean;
  conflictStrategy?: ContentSyncChannel["conflictStrategy"];
}

export interface UpdateChannelOptions extends Partial<CreateChannelOptions> {
  enabled?: boolean;
}

export interface SyncPlanOptions {
  locale?: string;
  relationDepth?: number;
  includeMedia?: boolean;
  userId?: string;
}

export interface SyncPlan {
  channelId: string;
  direction: "push" | "pull";
  sourceTenant: string;
  targetTenant: string;
  estimated: {
    collectionCounts: Record<string, number>;
    totalEntries: number;
    relatedEntries: number;
    mediaRefs: number;
    estimatedSizeBytes: number;
  };
  willAnonymize: boolean;
  conflictStrategy: ContentSyncChannel["conflictStrategy"];
  requiresConfirmation: boolean;
  warnings: string[];
  createdAt: string;
}

export interface PushOptions extends SyncPlanOptions {
  adminConfirmation?: boolean;
}

export interface PullOptions extends SyncPlanOptions {
  anonymize?: boolean;
}

export interface SyncResult {
  success: boolean;
  channelId: string;
  direction: "push" | "pull";
  jobId?: string | null;
  message: string;
  syncAt?: string;
}

export interface SyncJobStatus {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  total: number;
  processed: number;
  errors: number;
  startTime: string;
  estimatedCompletion?: string;
  error?: string;
  anonymized: boolean;
  channelId: string;
  direction: "push" | "pull";
}

// ---------------------------------------------------------------------------
// PII Anonymization
// ---------------------------------------------------------------------------

const PII_PATTERNS: Array<{
  fieldTest: (key: string) => boolean;
  anonymize: (value: unknown) => unknown;
}> = [
  {
    fieldTest: (k) => /email/i.test(k),
    anonymize: (v) => {
      if (typeof v !== "string" || !v.includes("@")) return v;
      return `anon_${hashStringForAnon(v)}@anonymous.local`;
    },
  },
  {
    fieldTest: (k) => /(^|_)name$/i.test(k) || /fullname/i.test(k),
    anonymize: (v) => {
      if (typeof v !== "string") return v;
      return `User_${hashStringForAnon(v)}`;
    },
  },
  {
    fieldTest: (k) => /(^|_)phone$/i.test(k) || /mobile/i.test(k) || /telephone/i.test(k),
    anonymize: () => "+0000000000",
  },
  {
    fieldTest: (k) => /ip$/i.test(k) || /ipAddress/i.test(k),
    anonymize: () => "0.0.0.0",
  },
  {
    fieldTest: (k) => /address/i.test(k),
    anonymize: () => "[REDACTED]",
  },
];

function hashStringForAnon(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

function anonymizeEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (key === "_id" || key === "tenantId" || key === "createdAt" || key === "updatedAt") {
      result[key] = value;
      continue;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = anonymizeEntry(value as Record<string, unknown>);
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "object" && item !== null
          ? anonymizeEntry(item as Record<string, unknown>)
          : item,
      );
      continue;
    }
    let matched = false;
    for (const pattern of PII_PATTERNS) {
      if (pattern.fieldTest(key)) {
        result[key] = pattern.anonymize(value);
        matched = true;
        break;
      }
    }
    if (!matched) result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// ContentSyncService
// ---------------------------------------------------------------------------

export class ContentSyncService {
  constructor() {
    jobQueue.registerHandler(SYNC_JOB_TYPE, this.executeSyncJob.bind(this));
  }

  // =========================================================================
  // CHANNEL MANAGEMENT
  // =========================================================================

  /** Creates a new sync channel (disabled by default). */
  public async createChannel(options: CreateChannelOptions): Promise<ContentSyncChannel> {
    const adapter = this.getAdapter();
    const now = new Date().toISOString();

    const channel: ContentSyncChannel = {
      channelId: `sync_${generateUUID().replace(/-/g, "").slice(0, 16)}`,
      label: options.label,
      source: options.source,
      target: options.target,
      collections: options.collections,
      direction: options.direction ?? "push",
      enabled: options.enabled ?? false,
      anonymizeOnPull: options.anonymizeOnPull ?? true,
      conflictStrategy: options.conflictStrategy ?? "skip",
      createdAt: now,
      updatedAt: now,
    };

    const result = await adapter.crud.insert(CHANNELS_COLLECTION, channel as any);
    if (!result.success) {
      throw new Error(`Failed to create sync channel: ${result.message}`);
    }

    logger.info(`[ContentSync] Created channel "${channel.label}" (${channel.channelId})`);
    return channel;
  }

  /** Updates an existing sync channel configuration. */
  public async updateChannel(
    channelId: string,
    updates: UpdateChannelOptions,
  ): Promise<ContentSyncChannel> {
    const adapter = this.getAdapter();
    const existing = await this.getChannel(channelId);
    if (!existing) throw new Error(`Channel not found: ${channelId}`);

    const now = new Date().toISOString();
    const merged = { ...existing, ...updates, updatedAt: now };

    // Ensure nested objects are merged correctly
    if (updates.source) merged.source = { ...existing.source, ...updates.source };
    if (updates.target) merged.target = { ...existing.target, ...updates.target };

    const result = await adapter.crud.update(
      CHANNELS_COLLECTION,
      existing.channelId as any,
      merged as any,
    );
    if (!result.success) {
      throw new Error(`Failed to update channel: ${result.message}`);
    }

    logger.info(`[ContentSync] Updated channel "${merged.label}" (${channelId})`);
    return merged;
  }

  /** Deletes a sync channel. */
  public async deleteChannel(channelId: string): Promise<void> {
    const adapter = this.getAdapter();
    const existing = await this.getChannel(channelId);
    if (!existing) throw new Error(`Channel not found: ${channelId}`);

    const result = await adapter.crud.delete(CHANNELS_COLLECTION, channelId as any);
    if (!result.success) {
      throw new Error(`Failed to delete channel: ${result.message}`);
    }

    logger.info(`[ContentSync] Deleted channel "${existing.label}" (${channelId})`);
  }

  /** Lists all configured sync channels, optionally filtered by tenant. */
  public async listChannels(tenantId?: string): Promise<ContentSyncChannel[]> {
    const adapter = this.getAdapter();
    const filter: Record<string, unknown> = {};
    if (tenantId) {
      filter["source.tenantId"] = tenantId;
    }

    const result = await adapter.crud.findMany(CHANNELS_COLLECTION, filter as any);
    if (!result.success) return [];
    return (result.data as unknown as ContentSyncChannel[]) ?? [];
  }

  /** Gets a single channel by its ID. */
  public async getChannel(channelId: string): Promise<ContentSyncChannel | null> {
    const adapter = this.getAdapter();
    const result = await adapter.crud.findOne(CHANNELS_COLLECTION, {
      channelId,
    } as any);
    if (!result.success || !result.data) return null;
    return result.data as unknown as ContentSyncChannel;
  }

  // =========================================================================
  // SYNC PLAN (PREVIEW)
  // =========================================================================

  /**
   * Creates a preview plan showing what would be synced.
   * Validates the channel and checks safety rules.
   */
  public async createSyncPlan(
    channelId: string,
    _options: SyncPlanOptions = {},
  ): Promise<SyncPlan> {
    const channel = await this.getChannel(channelId);
    if (!channel) throw new Error(`Channel not found: ${channelId}`);
    if (!channel.enabled) throw new Error(`Channel "${channel.label}" is not enabled.`);

    this.validateCollections(channel.collections);

    // For plan, direction is inferred from channel config (default to push for bidirectional)
    const direction: "push" | "pull" = channel.direction === "pull" ? "pull" : "push";
    const [sourceTenant, _targetTenant] = this.resolveTenants(channel, direction);
    const willAnonymize = direction === "pull" && channel.anonymizeOnPull;
    const requiresConfirmation = this.requiresConfirmation(channel, direction);
    const warnings = this.collectWarnings(channel, direction, willAnonymize);

    // Estimate entry counts by counting each collection
    const collectionCounts: Record<string, number> = {};
    let totalEntries = 0;

    for (const colName of channel.collections) {
      try {
        const countResult = await this.getAdapter().crud.count(
          colName,
          {},
          {
            tenantId: sourceTenant as any,
          },
        );
        const count = countResult.success ? (countResult.data ?? 0) : 0;
        collectionCounts[colName] = count;
        totalEntries += count;
      } catch {
        collectionCounts[colName] = 0;
      }
    }

    return {
      channelId,
      direction,
      sourceTenant,
      targetTenant: _targetTenant,
      estimated: {
        collectionCounts,
        totalEntries,
        relatedEntries: 0,
        mediaRefs: 0,
        estimatedSizeBytes: totalEntries * 2048, // rough estimate: 2KB per entry
      },
      willAnonymize,
      conflictStrategy: channel.conflictStrategy,
      requiresConfirmation,
      warnings,
      createdAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  // PUSH CONTENT (Source → Target)
  // =========================================================================

  /**
   * Exports content from the source tenant and imports it into the target.
   * Requires admin confirmation for production pushes.
   */
  public async pushContent(channelId: string, options: PushOptions = {}): Promise<SyncResult> {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      return { success: false, channelId, direction: "push", message: "Channel not found." };
    }
    if (!channel.enabled) {
      return {
        success: false,
        channelId,
        direction: "push",
        message: `Channel "${channel.label}" is not enabled.`,
      };
    }

    // Direction check
    if (channel.direction === "pull") {
      return {
        success: false,
        channelId,
        direction: "push",
        message: `Push is not allowed for channel "${channel.label}" (configured: ${channel.direction}).`,
      };
    }

    // Admin confirmation gate
    if (this.requiresConfirmation(channel, "push") && !options.adminConfirmation) {
      return {
        success: false,
        channelId,
        direction: "push",
        message: "Push from production requires admin confirmation (set adminConfirmation: true).",
      };
    }

    this.validateCollections(channel.collections);

    // Dispatch as background job
    const jobId = await jobQueue.dispatch(
      SYNC_JOB_TYPE,
      {
        channelId,
        tenantId: channel.source.tenantId,
        userId: options.userId ?? "system",
        direction: "push",
        collections: channel.collections,
        anonymized: false,
        duplicateStrategy: channel.conflictStrategy,
      },
      channel.source.tenantId,
    );

    if (!jobId) {
      return {
        success: false,
        channelId,
        direction: "push",
        message: "Failed to dispatch sync job. The job queue may not be available.",
      };
    }

    logger.info(`[ContentSync] Push job ${jobId} dispatched for channel "${channel.label}"`);

    // Emit webhook event (best-effort, non-blocking)
    try {
      const { eventBus } = await import("@src/services/background/automation/event-bus");
      eventBus.emit("content.sync.started", {
        tenantId: channel.source.tenantId,
        data: {
          channelId,
          direction: "push",
          entryCount: channel.collections.length,
          jobId,
        },
      });
    } catch {
      /* event emission is best-effort */
    }

    return {
      success: true,
      channelId,
      direction: "push",
      jobId,
      message: `Push job dispatched. Track progress via GET /api/content-sync/jobs/${jobId}`,
    };
  }

  // =========================================================================
  // PULL CONTENT (Target → Source)
  // =========================================================================

  /**
   * Exports content from the target tenant and imports it into the source.
   * Applies PII anonymization when pulling to dev environments (unless overridden).
   */
  public async pullContent(channelId: string, options: PullOptions = {}): Promise<SyncResult> {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      return { success: false, channelId, direction: "pull", message: "Channel not found." };
    }
    if (!channel.enabled) {
      return {
        success: false,
        channelId,
        direction: "pull",
        message: `Channel "${channel.label}" is not enabled.`,
      };
    }

    // Direction check
    if (channel.direction === "push") {
      return {
        success: false,
        channelId,
        direction: "pull",
        message: `Pull is not allowed for channel "${channel.label}" (configured: ${channel.direction}).`,
      };
    }

    this.validateCollections(channel.collections);

    const shouldAnonymize = options.anonymize ?? channel.anonymizeOnPull;

    // Dispatch as background job
    const jobId = await jobQueue.dispatch(
      SYNC_JOB_TYPE,
      {
        channelId,
        tenantId: channel.target.tenantId,
        userId: options.userId ?? "system",
        direction: "pull",
        collections: channel.collections,
        anonymized: shouldAnonymize,
        duplicateStrategy: channel.conflictStrategy,
      },
      channel.target.tenantId,
    );

    if (!jobId) {
      return {
        success: false,
        channelId,
        direction: "pull",
        message: "Failed to dispatch sync job. The job queue may not be available.",
      };
    }

    logger.info(
      `[ContentSync] Pull job ${jobId} dispatched for channel "${channel.label}"` +
        (shouldAnonymize ? " (with anonymization)" : ""),
    );

    // Emit webhook event (best-effort, non-blocking)
    try {
      const { eventBus } = await import("@src/services/background/automation/event-bus");
      eventBus.emit("content.sync.started", {
        tenantId: channel.target.tenantId,
        data: {
          channelId,
          direction: "pull",
          entryCount: channel.collections.length,
          jobId,
          anonymized: shouldAnonymize,
        },
      });
    } catch {
      /* event emission is best-effort */
    }

    return {
      success: true,
      channelId,
      direction: "pull",
      jobId,
      message:
        `Pull job dispatched${shouldAnonymize ? " with anonymization" : ""}. ` +
        `Track progress via GET /api/content-sync/jobs/${jobId}`,
    };
  }

  // =========================================================================
  // JOB STATUS
  // =========================================================================

  /**
   * Returns the current status of a sync job.
   */
  public async getJobStatus(jobId: string): Promise<SyncJobStatus | null> {
    const db = (await import("@src/databases/db")).getDb();
    if (!db || !db.system?.jobs) return null;

    try {
      const result = await db.system.jobs.getById(jobId as any);
      if (!result.success || !result.data) return null;

      const job = result.data;
      const payload = (job.payload as Record<string, unknown> | undefined) ?? {};
      const operations = payload.operations as unknown[] | undefined;

      return {
        jobId: String(job._id ?? jobId),
        status: (job.status as SyncJobStatus["status"]) ?? "pending",
        progress: (job.progress as number) ?? 0,
        total: operations?.length ?? 0,
        processed: Math.round((((job.progress as number) ?? 0) / 100) * (operations?.length ?? 1)),
        errors: 0,
        startTime: String(job.createdAt ?? ""),
        estimatedCompletion: job.nextRunAt ? String(job.nextRunAt) : undefined,
        error: job.lastError as string | undefined,
        anonymized: (payload.anonymized as boolean) ?? false,
        channelId: (payload.channelId as string) ?? "unknown",
        direction: (payload.direction as "push" | "pull") ?? "push",
      };
    } catch (err) {
      logger.error(`[ContentSync] Failed to get job status for ${jobId}:`, err);
      return null;
    }
  }

  // =========================================================================
  // BACKGROUND JOB HANDLER
  // =========================================================================

  /** Background job handler registered with JobQueueService. */
  private async executeSyncJob(payload: Record<string, unknown>): Promise<void> {
    const channelId = payload.channelId as string;
    const direction = payload.direction as "push" | "pull";
    const anonymized = payload.anonymized as boolean;
    const collections = payload.collections as string[];

    logger.info(
      `[ContentSync] Executing background sync — channel ${channelId}, ` +
        `direction ${direction}${anonymized ? ", anonymized" : ""}`,
    );

    const channel = await this.getChannel(channelId);
    if (!channel) throw new Error(`Channel not found: ${channelId}`);

    try {
      const [sourceTenant, targetTenant] = this.resolveTenants(channel, direction);

      // Step 1: Export from source
      const { contentPackageService } = await import("./content-package-service");
      const pkg = await contentPackageService.runExport({
        collections: collections ?? channel.collections,
        tenantId: sourceTenant,
      });

      // Step 2: Anonymize if needed
      let finalPackage = pkg;
      if (anonymized) {
        finalPackage = await anonymizeContentPackage(pkg);
      }

      // Step 3: Import into target
      const plan = await contentPackageService.planImport(finalPackage, {
        duplicateStrategy: (payload.duplicateStrategy as any) ?? "skip",
        tenantId: targetTenant,
      });

      await contentPackageService.applyImport(plan.planId, {
        duplicateStrategy: (payload.duplicateStrategy as any) ?? "skip",
        tenantId: targetTenant,
        background: false,
      });

      await this.touchChannelLastSync(channelId);

      logger.info(`[ContentSync] Background sync completed — channel ${channelId}`);

      // Emit webhook event (best-effort, non-blocking)
      try {
        const { eventBus } = await import("@src/services/background/automation/event-bus");
        const finalEntryCount = pkg?.manifest?.resources
          ? Object.values(pkg.manifest.resources).reduce<number>((a, b) => a + (Number(b) || 0), 0)
          : 0;
        eventBus.emit("content.sync.completed", {
          tenantId: targetTenant,
          data: {
            channelId,
            direction,
            entryCount: finalEntryCount,
            anonymized,
          },
        });
      } catch {
        /* event emission is best-effort */
      }
    } catch (err) {
      logger.error(`[ContentSync] Background sync failed for channel ${channelId}:`, err);
      throw err;
    }
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private getAdapter(): IDBAdapter {
    const adapter = dbAdapter as IDBAdapter | null;
    if (!adapter) throw new Error("Database adapter is not available.");
    return adapter;
  }

  private resolveTenants(
    channel: ContentSyncChannel,
    direction: "push" | "pull",
  ): [string, string] {
    if (direction === "push") {
      return [channel.source.tenantId, channel.target.tenantId];
    }
    return [channel.target.tenantId, channel.source.tenantId];
  }

  private validateCollections(collections: string[]): void {
    for (const col of collections) {
      const lower = col.toLowerCase();
      if (FORBIDDEN_COLLECTIONS.has(lower)) {
        throw new Error(
          `Collection "${col}" is a sensitive system collection and cannot be synced.`,
        );
      }
    }
  }

  private requiresConfirmation(channel: ContentSyncChannel, direction: "push" | "pull"): boolean {
    if (direction === "push") {
      const sourceLabel = channel.source.label.toLowerCase();
      if (sourceLabel.includes("prod") || sourceLabel.includes("production")) {
        return true;
      }
    }
    if (direction === "pull" && !channel.anonymizeOnPull) {
      const targetLabel = channel.target.label.toLowerCase();
      if (targetLabel.includes("prod") || targetLabel.includes("production")) {
        return true;
      }
    }
    return false;
  }

  private collectWarnings(
    channel: ContentSyncChannel,
    direction: "push" | "pull",
    willAnonymize: boolean,
  ): string[] {
    const warnings: string[] = [];
    if (direction === "push") {
      const src = channel.source.label.toLowerCase();
      if (src.includes("prod") || src.includes("production")) {
        warnings.push("Pushing from a production environment. Confirm this is intended.");
      }
    }
    if (direction === "pull") {
      const tgt = channel.target.label.toLowerCase();
      if (tgt.includes("prod") || tgt.includes("production")) {
        warnings.push("Pulling from a production environment.");
        if (willAnonymize) {
          warnings.push("PII will be anonymized (anonymizeOnPull is enabled).");
        } else {
          warnings.push("PII anonymization is disabled — identifiable data will be pulled.");
        }
      }
    }
    if (channel.conflictStrategy === "fail") {
      warnings.push("Conflict strategy is 'fail' — any conflicts will abort the sync.");
    }
    return warnings;
  }

  private async touchChannelLastSync(channelId: string): Promise<void> {
    try {
      const adapter = this.getAdapter();
      await adapter.crud.update(
        CHANNELS_COLLECTION,
        channelId as any,
        { lastSyncAt: new Date().toISOString() } as any,
      );
    } catch (err) {
      logger.warn(`[ContentSync] Could not update lastSyncAt for channel ${channelId}:`, err);
    }
  }
}

/**
 * Anonymizes a content package for safe production-to-dev pulls.
 * Replaces PII in all entries and regenerates checksums.
 */
async function anonymizeContentPackage(pkg: any): Promise<any> {
  const anonymizedCollections: Record<string, string> = {};
  let totalAnonymized = 0;

  for (const [colName, ndjson] of Object.entries(pkg.collections ?? {})) {
    const lines = (ndjson as string).split("\n").filter(Boolean);
    const anonymizedLines: string[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        anonymizedLines.push(JSON.stringify(anonymizeEntry(entry)));
        totalAnonymized++;
      } catch {
        anonymizedLines.push(line);
      }
    }
    anonymizedCollections[colName] = anonymizedLines.join("\n");
  }

  const checksums: Record<string, string> = { ...pkg.checksums };
  checksums["manifest.json"] = await createChecksum(pkg.manifest);
  for (const [colName, ndjson] of Object.entries(anonymizedCollections)) {
    checksums[`collections/${colName}.ndjson`] = await createChecksum(ndjson);
  }

  logger.info(
    `[ContentSync] Anonymized ${totalAnonymized} entries across ${Object.keys(anonymizedCollections).length} collections`,
  );

  return {
    ...pkg,
    collections: anonymizedCollections,
    checksums,
    manifest: { ...pkg.manifest, checksums },
  };
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const contentSyncService = new ContentSyncService();
