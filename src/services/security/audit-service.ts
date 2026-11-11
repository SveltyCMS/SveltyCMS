/**
 * @file src/services/security/audit-service.ts
 * @description Unified Audit Service providing high-integrity, multi-tenant audit logging.
 */

import fsPromises from "node:fs/promises";
import path from "node:path";
import { dbAdapter as dbAdapterInstance } from "@src/databases/db";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import type {
  BaseEntity,
  DatabaseId,
  DatabaseResult,
  IDBAdapter,
} from "@src/databases/db-interface";
import { logger } from "@utils/logger";
import { nowISODateString } from "@utils/date";
import {
  getAuditFlags,
  getAuditFlagsSync,
  isAuditDisabledByEnv,
} from "@utils/security/audit-flags";
import {
  auditChainService,
  AUDIT_CHECKPOINT_KEY,
  chainHashScope,
  type ChainedAuditEntry,
} from "@src/services/audit-chain";
import { generateUUID } from "@utils/native-utils";

/**
 * Bounded re-chain attempts after the fork guard rejects a batch.
 *
 * Three is enough for a handful of instances writing one tenant: each retry re-reads
 * the head that won, so a persistent conflict is a real problem and must fall back
 * instead of spinning.
 */
const MAX_CHAIN_ATTEMPTS = 3;

export type AuditSeverity = "low" | "medium" | "high" | "critical";

const SENSITIVE_KEY_RE = /password|secret|token|authorization|credential|api[_-]?key/i;

function redactValue(v: unknown): unknown {
  if (Array.isArray(v)) {
    return v.map(redactValue);
  }
  if (v && typeof v === "object") {
    return redactSensitiveDetails(v as Record<string, unknown>);
  }
  return v;
}

export function redactSensitiveDetails(details: Record<string, unknown>): Record<string, unknown> {
  if (!details || typeof details !== "object") return details;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      clean[k] = "[REDACTED]";
    } else {
      clean[k] = redactValue(v);
    }
  }
  return clean;
}

/** Outbox collection — internal machinery, excluded from automatic audit hooks. */
const OUTBOX_COLLECTION = "svelty_outbox";

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
  WEBHOOK_CREATED = "webhook_created",
  WEBHOOK_UPDATED = "webhook_updated",
  WEBHOOK_DELETED = "webhook_deleted",
  API_KEY_CREATED = "api_key_created",
  API_KEY_REVOKED = "api_key_revoked",
  MAGIC_LINK_REQUESTED = "magic_link_requested",
  MAGIC_LINK_SUCCESS = "magic_link_success",
  ROLE_MUTATED = "role_mutated",
  ROLE_DELETED = "role_deleted",
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
  /** `tenantId ?? "__global__"` — chain scope, and the fork-guard index key. */
  chainScope?: string;
  /** SHA-256 of the canonical payload + previousHash — see `audit-chain.ts`. */
  chainHash?: string;
  rawJson?: string;
}

export type BufferedAuditEntry = Omit<AuditLogEntry, "_id"> & { _id?: DatabaseId };

/** Tunables, overridable in tests. Defaults are the production values. */
export interface AuditServiceOptions {
  /** Sustained-stream flush threshold (entries). */
  maxBufferSize?: number;
  /** Hard cap on buffered entries; the OLDEST are dropped and counted beyond it. */
  maxTotalBuffer?: number;
  /** Periodic flush interval. */
  flushIntervalMs?: number;
  /** Trailing idle window that coalesces write bursts. */
  microBatchMs?: number;
}

/**
 * Live instances, so the SIGTERM/SIGINT hook can flush every buffer (the module
 * singleton in production, individual instances in tests).
 */
const liveAuditServices = new Set<AuditService>();

/**
 * Flush every buffered audit entry before the process dies.
 *
 * Without this, up to `maxTotalBuffer` entries — the entries an operator most
 * wants after a crash — are lost on every deploy/restart. Bounded by a 2s
 * deadline so a wedged database cannot hang shutdown forever.
 */
export async function flushAuditBuffersOnShutdown(): Promise<void> {
  const pending = [...liveAuditServices].map((service) => service.flush().catch(() => {}));
  if (pending.length === 0) return;
  await Promise.race([
    Promise.all(pending).then(() => undefined),
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2000);
      (timer as { unref?: () => void }).unref?.();
    }),
  ]);
}

function installShutdownHooks(): void {
  type SignalHost = typeof globalThis & { __sveltyAuditShutdownHooks?: boolean };
  const host = globalThis as SignalHost;
  // HMR re-evaluates this module; install the handlers once per process.
  if (host.__sveltyAuditShutdownHooks) return;
  host.__sveltyAuditShutdownHooks = true;

  const onSignal = (code: number) => {
    void flushAuditBuffersOnShutdown().finally(() => process.exit(code));
  };
  process.once("SIGTERM", () => onSignal(143));
  process.once("SIGINT", () => onSignal(130));
}

export class AuditService {
  private readonly collectionName = "auditLogs";
  private readonly logFile = path.join(process.cwd(), "logs", "audit.log");
  private buffer: BufferedAuditEntry[] = [];
  private flushTimer: any = null;
  private microBatchTimer: NodeJS.Timeout | null = null;
  private inFlightFlush: Promise<void> | null = null;
  /** Serializes `flush()` itself so interval/micro-batch/size/chainSync callers cannot interleave buffer swaps. */
  private flushInFlight: Promise<void> | null = null;
  /** Entries discarded because the buffer was full — surfaced, never silent. */
  private droppedEntries = 0;
  private lastDropWarnAt = 0;
  private readonly maxBufferSize: number;
  private readonly maxTotalBuffer: number;
  private readonly microBatchMs: number;
  private readonly flushIntervalMs: number;
  private initialized = false;

  constructor(options: AuditServiceOptions = {}) {
    this.maxBufferSize = options.maxBufferSize ?? 50;
    this.maxTotalBuffer = options.maxTotalBuffer ?? 200;
    this.microBatchMs = options.microBatchMs ?? 15;
    this.flushIntervalMs = options.flushIntervalMs ?? 5000;

    liveAuditServices.add(this);
    installShutdownHooks();

    this.init().catch((err) => logger.error("AuditService init failed", err));
    this.startFlushTimer();
  }

  /** Number of buffered entries discarded since start (0 = no audit loss). */
  public getDroppedEntryCount(): number {
    return this.droppedEntries;
  }

  /** Stops the timers and unregisters the instance (tests / graceful teardown). */
  public async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.microBatchTimer) {
      clearTimeout(this.microBatchTimer);
      this.microBatchTimer = null;
    }
    liveAuditServices.delete(this);
    await this.flush().catch(() => {});
  }

  /**
   * Counts dropped entries and warns loudly. Audit loss must never be silent:
   * the warning is throttled to one per second but the cumulative total is
   * always included, and `getDroppedEntryCount()` exposes it to health checks.
   */
  private recordDroppedEntries(count: number, reason: string): void {
    if (count <= 0) return;
    this.droppedEntries += count;
    const now = Date.now();
    if (this.droppedEntries === count || now - this.lastDropWarnAt >= 1000) {
      this.lastDropWarnAt = now;
      logger.warn(
        `[Audit] Dropped ${count} audit entr${count === 1 ? "y" : "ies"} (${reason}); ${this.droppedEntries} dropped in total — the audit trail is INCOMPLETE`,
      );
    }
  }

  private startFlushTimer() {
    type AuditTimerHost = typeof globalThis & {
      __sveltyAuditInterval?: ReturnType<typeof setInterval>;
    };
    const host = globalThis as AuditTimerHost;

    if (this.flushTimer) clearInterval(this.flushTimer);
    // 🛡️ HMR SAFETY: a module re-evaluation creates a new singleton; clear the
    // stale interval before installing the new one (mirrors the watchdog latch).
    if (host.__sveltyAuditInterval) {
      clearInterval(host.__sveltyAuditInterval);
      host.__sveltyAuditInterval = undefined;
    }
    // 🧪 PERFORMANCE: During benchmarks, we don't even need the timer if logs are disabled
    if (isAuditDisabledByEnv()) return;
    const timer = setInterval(() => this.flush(), this.flushIntervalMs);
    (timer as { unref?: () => void }).unref?.();
    this.flushTimer = timer;
    host.__sveltyAuditInterval = timer;
  }

  private isMissingAuditStoreError(error: unknown) {
    const candidates = [
      error,
      (error as any)?.cause,
      (error as any)?.error,
      (error as any)?.originalError,
    ].filter(Boolean);

    return candidates.some((candidate) => {
      const message = [
        (candidate as any)?.message,
        (candidate as any)?.sqlMessage,
        (candidate as any)?.errmsg,
        String(candidate),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const code = String((candidate as any)?.code || "").toLowerCase();
      return (
        (message.includes("audit_logs") &&
          (message.includes("doesn't exist") ||
            message.includes("does not exist") ||
            message.includes("no such table") ||
            message.includes("namespacenotfound"))) ||
        code === "er_no_such_table" ||
        code === "namespace_not_found"
      );
    });
  }

  public flush(): Promise<void> {
    const running = this.flushInFlight;
    if (running) {
      // Wait for the active swap, then drain anything buffered while it ran —
      // `chainSync` must not return before its entry is persisted.
      return running.then(() => {
        if (this.buffer.length === 0 || this.flushInFlight) return;
        return this.flush();
      });
    }
    let run: Promise<void>;
    run = (async () => {
      // Drain in passes: entries can be buffered while a DB write is in flight.
      // The single `flushInFlight` handle stops two callers interleaving swaps.
      // A failed pass returns false so the loop stops instead of hammering a
      // broken store (the restored buffer retries later).
      for (let pass = 0; pass < 8; pass++) {
        const drained = await this._flushOnce();
        if (!drained || this.buffer.length === 0) break;
      }
    })().finally(() => {
      if (this.flushInFlight === run) this.flushInFlight = null;
    });
    this.flushInFlight = run;
    return run;
  }

  /** Returns true when the pass consumed its buffer; false stops the drain loop. */
  private async _flushOnce(): Promise<boolean> {
    if (this.microBatchTimer) {
      clearTimeout(this.microBatchTimer);
      this.microBatchTimer = null;
    }
    if (this.buffer.length === 0) return false;
    if (isAuditDisabledByEnv()) {
      this.buffer = [];
      return false;
    }
    const flags = await getAuditFlags().catch(() => null);
    if (flags?.disabled) {
      this.buffer = [];
      return false;
    }

    let batch = [...this.buffer];
    this.buffer = [];

    let lastError: unknown = null;
    // The checkpoint must cover every row this flush attempted, including a prefix that a
    // non-atomic (MongoDB) bulk write already stored before it rejected the rest.
    let checkpointBatch = batch;
    for (let attempt = 1; attempt <= MAX_CHAIN_ATTEMPTS; attempt++) {
      try {
        await this.insertBatch(batch);
        // 🔒 The entries are durable; now advance the per-tenant tail checkpoint. It
        // is the only thing that makes a *truncated* tail detectable (a hash chain
        // cannot see its own end). Once per flush, never per entry, and a failure
        // here must not fail the flush — the count only goes up after a write.
        await this.commitCheckpoints(checkpointBatch);
        return true;
      } catch (error) {
        lastError = error;
        // Only the fork guard is recoverable here: if the tenant's stored head moved
        // past the head this batch was chained onto, another writer won the race and
        // re-chaining will succeed. Anything else falls through to the fallback.
        if (attempt < MAX_CHAIN_ATTEMPTS && (await this.chainHeadAdvanced(batch))) {
          // MongoDB applies a rejected bulk write with `ordered: false`, so part of the
          // batch may have landed. Keep only what is still missing.
          const attempted = batch;
          const remaining = await this.dropAlreadyStored(attempted);
          if (remaining.length === 0) {
            // Every row landed despite the error; only the checkpoint is missing.
            await this.commitCheckpoints(attempted);
            return true;
          }
          // Another process appended first and the unique (chainScope, previousHash)
          // index rejected our children of the same head. Re-chain onto the winner
          // and retry. Bounded on purpose: a conflict that keeps recurring must
          // surface as a failure, not spin.
          logger.warn(
            `[Audit] Chain head advanced concurrently (attempt ${attempt}/${MAX_CHAIN_ATTEMPTS}); re-chaining ${remaining.length} entr${remaining.length === 1 ? "y" : "ies"}`,
          );
          // Same view of the row in both directions: `rechain` speaks
          // `ChainedAuditEntry`, the buffer holds `BufferedAuditEntry`; the runtime
          // object is identical (the chain fields are the only difference and both
          // types declare them).
          const rehashed = (await auditChainService.rechain(
            remaining as ChainedAuditEntry[],
          )) as BufferedAuditEntry[];
          // Checkpoint the WHOLE attempt: rows that already landed keep their stored
          // hashes, the rest take the re-chained ones, and the tail stays last.
          const rehashedById = new Map(rehashed.map((entry) => [String(entry._id), entry]));
          checkpointBatch = [
            ...attempted.filter((entry) => !rehashedById.has(String(entry._id))),
            ...rehashed,
          ];
          batch = rehashed;
          continue;
        }
        break;
      }
    }

    const error = lastError;
    if (this.isMissingAuditStoreError(error)) {
      // The fallback file keeps the forensics, but these rows will never be
      // in the chain — count them so the gap is explicit.
      this.recordDroppedEntries(
        batch.length,
        "audit store unavailable during flush (file fallback only)",
      );
      await this.appendEntriesToFile(batch).catch(() => {});
      return false;
    }

    // DB write failed — fall back to the append-only log file.
    await this.appendEntriesToFile(batch).catch(() => {});
    logger.error("[Audit] Flush failed, restoring buffer", error);
    // 🛡️ MEMORY LEAK FIX: Cap the restoration to prevent unbounded growth
    const combined = [...batch, ...this.buffer];
    if (combined.length > this.maxTotalBuffer) {
      this.recordDroppedEntries(
        combined.length - this.maxTotalBuffer,
        "retry buffer overflow after failed flush",
      );
      this.buffer = combined.slice(-this.maxTotalBuffer);
    } else {
      this.buffer = combined;
    }
    return false;
  }

  /**
   * Ids from `entries` that are now in the store, or `null` when it could not be determined.
   * Only called once per flush, so one indexed `_id $in` query is acceptable; it replaces a
   * counter that silently drifted whenever a write was partially applied.
   */
  private async storedIdsOf(entries: BufferedAuditEntry[]): Promise<Set<string> | null> {
    const ids = entries.map((entry) => entry._id).filter((id): id is DatabaseId => Boolean(id));
    if (!dbAdapterInstance || ids.length === 0) return null;
    try {
      const found = await dbAdapterInstance.crud.findMany(
        this.collectionName,
        { _id: { $in: ids } } as any,
        { ...withSystemScope("audit-flush"), limit: ids.length } as any,
      );
      if (!found?.success) return null;
      return new Set((found.data ?? []).map((row: any) => String(row._id)));
    } catch (err) {
      logger.debug("[Audit] Could not verify which entries landed; using the batch count", err);
      return null;
    }
  }

  /**
   * Returns the batch entries the store does not already hold, matched by `_id`.
   *
   * Only reachable after a failed insert, so it is not on any hot path. It exists because
   * a rejected bulk write is not necessarily atomic: MongoDB runs `bulkWrite` with
   * `ordered: false` and leaves the already-written rows in place, so re-inserting the
   * whole batch would collide on `_id` on every attempt.
   */
  private async dropAlreadyStored(batch: BufferedAuditEntry[]): Promise<BufferedAuditEntry[]> {
    const stored = await this.storedIdsOf(batch);
    if (!stored) return batch;
    return batch.filter((entry) => !stored.has(String(entry._id)));
  }

  /**
   * Writes one batch to the audit store and fails loudly when the store rejects it.
   *
   * The result MUST be inspected: `crud.insertMany` resolves with a failure envelope
   * instead of throwing, so the previous `await`-and-ignore dropped the whole batch
   * while the flush reported success.
   */
  private async insertBatch(batch: BufferedAuditEntry[]): Promise<void> {
    if (!dbAdapterInstance) {
      // No DB adapter — the append-only log file is the only sink.
      await this.appendEntriesToFile(batch);
      return;
    }
    if (dbAdapterInstance.crud?.insertMany) {
      // skipReturning: the flushed entries are already in memory.
      const result = await dbAdapterInstance.crud.insertMany(
        this.collectionName,
        batch as any[],
        {
          ...withSystemScope("audit-flush"),
          skipReturning: true,
        } as any,
      );
      if (!result?.success) {
        throw new Error(`audit insertMany failed: ${result?.message ?? "unknown error"}`);
      }
      return;
    }
    if (dbAdapterInstance.batch?.bulkInsert) {
      const result = await dbAdapterInstance.batch.bulkInsert(this.collectionName, batch);
      if (result && (result as any).success === false) {
        throw new Error(`audit bulkInsert failed: ${(result as any).message ?? "unknown error"}`);
      }
      return;
    }
    for (const entry of batch) {
      const result = await dbAdapterInstance.crud.insert(this.collectionName, entry);
      if (!result?.success) {
        throw new Error(`audit insert failed: ${result?.message ?? "unknown error"}`);
      }
    }
  }

  /**
   * Whether another writer advanced the chain past the head this batch was built on.
   *
   * Asked only after a failed insert, so it is off the hot path. A store that cannot
   * answer (the database is down) returns false: the caller then takes the normal
   * fallback instead of re-chaining against an unreachable store.
   */
  private async chainHeadAdvanced(batch: BufferedAuditEntry[]): Promise<boolean> {
    const expectedHead = batch[0]?.previousHash;
    if (!expectedHead) return false;
    const tenantId = (batch[0].tenantId as string | null | undefined) ?? null;
    try {
      const head = await auditChainService.currentHead(tenantId);
      return head !== expectedHead;
    } catch (err) {
      logger.debug("[Audit] Could not read the chain head after a failed flush", err);
      return false;
    }
  }

  /**
   * Advances each touched tenant's chain checkpoint to the tail of this batch.
   *
   * Per-tenant, in batch order: the last entry of a tenant wins, so the checkpoint
   * always names the newest committed entry of that tenant.
   *
   * The increment is counted from the STORE, not from the batch length. A rejected bulk
   * write is not necessarily atomic (MongoDB runs `bulkWrite` with `ordered: false`), so
   * an accumulated counter drifts and a drifted counter makes truncation detection raise
   * false alarms. Counting the batch's own ids is one query and exact.
   */
  private async commitCheckpoints(entries: BufferedAuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const stored = await this.storedIdsOf(entries);
    const tails = new Map<string | null, { count: number; headHash: string }>();
    for (const entry of entries) {
      const headHash = entry.chainHash as string | undefined;
      if (!headHash) continue;
      // `stored === null` means the verification query was unavailable — fall back to
      // the batch itself, which is correct whenever the write was atomic.
      if (stored && !stored.has(String(entry._id))) continue;
      const tenantId = (entry.tenantId as string | null | undefined) ?? null;
      const tail = tails.get(tenantId);
      tails.set(tenantId, { count: (tail?.count ?? 0) + 1, headHash });
    }
    for (const [tenantId, tail] of tails) {
      await auditChainService
        .commitCheckpoint(tenantId, tail.headHash, tail.count)
        .catch((err) => logger.warn("[Audit] Chain checkpoint failed:", err));
    }
  }

  /**
   * Append-only fallback sink, used only when the DB write is unavailable.
   *
   * Entries are serialised here rather than at log() time: the DB path never reads
   * `rawJson`, so building it eagerly cost one `JSON.stringify` + one large string
   * per buffered entry on every audited mutation. `rawJson` is still honoured when a
   * caller supplies a pre-serialised entry.
   */
  private appendEntriesToFile(entries: BufferedAuditEntry[]): Promise<void> {
    const logData = entries.map((e) => e.rawJson ?? JSON.stringify(e)).join("\n") + "\n";
    return fsPromises.appendFile(this.logFile, logData);
  }

  public registerHooks(adapter: IDBAdapter) {
    if (!adapter.registerHook) return;

    // 🛡️ CRITICAL PERFORMANCE FIX: Physically skip hook registration during benchmarks.
    // This prevents the buffer from capturing 100k+ inserts even if flush() is called.
    if (isAuditDisabledByEnv()) {
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
      handler: (collection: string, data: any, options: any) => {
        // Skip the audit store itself (recursion) and the transactional
        // outbox — outbox events are internal machinery tracked by their own
        // delivery status, and audit-logging each flush batch cascades into
        // 1000-entry audit flushes on the content-write path.
        if (collection === this.collectionName) return;
        if (collection === OUTBOX_COLLECTION) return;
        // The chain checkpoint lives in `systemPreferences`; auditing it would make
        // every flush emit an audit entry, which in turn writes a checkpoint.
        if (collection === "systemPreferences" && (data as any)?.key === AUDIT_CHECKPOINT_KEY)
          return;

        // The HTTP mutation audit (`handle-audit-logging.ts`, one entry per
        // request: method/path/user/status/ip) already covers interactive
        // writes. This adapter hook adds a SECOND, per-insert audit row and is
        // insert-only — measured ~−22% create throughput at 8c under
        // `AUDIT_CHAIN_SYNC=false` (updates never paid it, which is exactly why
        // only the create lane lagged while reads/updates won). The per-row
        // duplicate is therefore OFF by default; `AUDIT_INSERT_HOOK=true`
        // restores the full per-insert DATA_IMPORT trail (forensic opt-in).
        // `AUDIT_SKIP_CONTENT_INSERT_HOOK` is kept as an accepted alias so the
        // earlier A/B switch still parses.
        if (
          process.env.AUDIT_INSERT_HOOK !== "true" ||
          process.env.AUDIT_SKIP_CONTENT_INSERT_HOOK === "true"
        )
          return;

        // The event (actor, target, severity, hash-chain link) is the audit
        // record; embedding the FULL document serialized + SHA-256-hashed the
        // whole payload on every insert and bloated each audit row. Keep a
        // compact id reference by default; `AUDIT_INSERT_FULL_PAYLOAD=true`
        // restores the legacy full-document payload (A/B / forensic opt-in).
        const details =
          process.env.AUDIT_INSERT_FULL_PAYLOAD === "true" ? { data } : { _id: (data as any)?._id };

        this.log(
          "Automatic Audit",
          {
            id: "system" as DatabaseId,
            email: "system@svelty.cms",
            role: "system",
          },
          { type: collection, id: (data as any)?._id || "unknown" },
          AuditEventType.DATA_IMPORT,
          "low",
          details,
          options?.tenantId,
        ).catch((err) => logger.warn("[Audit] Hook log failed:", err));
      },
    });
    logger.info("[Audit] Registered global Titan Tier hooks.");
  }

  private async init() {
    if (this.initialized) return;
    if (isAuditDisabledByEnv()) {
      this.initialized = true;
      return;
    }
    const flags = await getAuditFlags().catch(() => null);
    if (flags?.disabled) {
      this.initialized = true;
      return;
    }
    try {
      await fsPromises.mkdir(path.dirname(this.logFile), { recursive: true });
      this.initialized = true;
    } catch (err) {
      logger.error("Failed to initialize AuditService storage", err);
    }
  }

  private chainLock: Promise<void> = Promise.resolve();

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
    if (isAuditDisabledByEnv()) return;

    // Serialized hash-chain queue to guarantee tamper-evident crypto chain integrity under concurrent writes
    this.chainLock = this.chainLock
      .then(async () => {
        // Sync-first flags: env/cached read avoids a promise hop per entry on
        // the hot chain (measured ~10µs of the per-write audit cost).
        const flags = getAuditFlagsSync() ?? (await getAuditFlags().catch(() => null));
        if (flags?.disabled) return;

        // Zero-allocation cached timestamp (per-ms reuse) — this runs on every
        // write in the crypto chain, the documented create/update bottleneck.
        const timestamp = nowISODateString();
        const entry: Omit<AuditLogEntry, "_id"> & { _id: DatabaseId } = {
          // Stable id assigned at buffer time: a retry after a partially applied
          // batch (MongoDB `bulkWrite` runs `ordered: false`) must collide on `_id`
          // rather than duplicate the audit row.
          _id: generateUUID() as DatabaseId,
          action,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          actorIp: actor.ip,
          targetId: resource.id,
          targetType: resource.type,
          eventType,
          severity,
          details: redactSensitiveDetails(details),
          tenantId,
          chainScope: chainHashScope(tenantId as string | null | undefined),
          result,
          timestamp,
          createdAt: timestamp as any,
          updatedAt: timestamp as any,
        };

        // Tamper-evident audit chain: `AuditChainService` reads the tenant's
        // chain head under a per-tenant lock and hashes the canonical payload
        // (the same one `verifyChain()` uses). `createHash` here was a private
        // scheme the verifier could never reproduce — every row looked tampered.
        const chained = await auditChainService.append(entry as ChainedAuditEntry);
        const chainHash = chained.chainHash as string;

        // `hash` is kept as an alias for callers written before `chainHash`.
        // codeql[js/insufficient-password-hash]
        const persisted: BufferedAuditEntry = {
          ...entry,
          previousHash: chained.previousHash,
          chainHash,
          hash: chainHash,
        };

        // 🚀 HOT PATH: no eager `JSON.stringify`. The persisted row is serialised
        // only by `appendEntriesToFile()` — the fallback sink used when the DB
        // write fails — so the per-mutation cost of the audit trail is one object
        // spread and one hash, not a full serialisation that the DB path discards.

        // 🛡️ BOUNDED BUFFER: drop the OLDEST entries beyond the hard cap and
        // count them — unbounded growth is a memory leak, silent loss is worse.
        if (this.buffer.length >= this.maxTotalBuffer) {
          const overflow = this.buffer.length - this.maxTotalBuffer + 1;
          this.buffer.splice(0, overflow);
          this.recordDroppedEntries(overflow, "buffer full (oldest entries evicted)");
        }
        this.buffer.push(persisted);
        // 🛡️ ENTERPRISE MODE: AUDIT_CHAIN_SYNC awaits persistence before returning,
        // guaranteeing the entry survives even if the process dies mid-request.
        // Uses coalesced inFlightFlush to prevent single-row transaction thrashing.
        if (flags?.chainSync) {
          if (!this.inFlightFlush) {
            this.inFlightFlush = this.flush().finally(() => {
              this.inFlightFlush = null;
            });
            await this.inFlightFlush.catch((err) =>
              logger.error("[AuditService] Failed to flush audit logs:", err),
            );
          } else {
            await this.inFlightFlush.catch(() => {});
            if (this.buffer.length > 0) {
              if (!this.inFlightFlush) {
                this.inFlightFlush = this.flush().finally(() => {
                  this.inFlightFlush = null;
                });
              }
              await this.inFlightFlush.catch((err) =>
                logger.error("[AuditService] Failed to flush coalesced audit logs:", err),
              );
            }
          }
        } else if (this.buffer.length >= this.maxBufferSize) {
          if (this.microBatchTimer) {
            clearTimeout(this.microBatchTimer);
            this.microBatchTimer = null;
          }
          void this.flush().catch((err) =>
            logger.error("[AuditService] Failed to flush audit logs in background:", err),
          );
        } else {
          // 🚀 TRUE TRAILING DEBOUNCE: re-arm the timer on EVERY entry. The
          // previous arm-once shape flushed on a fixed 15ms cadence under
          // sustained writes (~every 3-4 creates at benchmark rates), and each
          // flush is a DB commit fsync that serializes with the next write's
          // commit — the measured +1.8ms-per-create regression. A resetting
          // timer only fires MICRO_BATCH_MS after the stream goes quiet (the
          // documented "trailing idle window" intent), so sustained streams
          // flush at maxBufferSize instead of on the timer.
          if (this.microBatchTimer) {
            clearTimeout(this.microBatchTimer);
          }
          this.microBatchTimer = setTimeout(() => {
            this.microBatchTimer = null;
            void this.flush().catch((err) =>
              logger.error("[AuditService] Failed to flush micro-batch audit logs:", err),
            );
          }, this.microBatchMs);
        }
      })
      .catch((err) => logger.warn("[AuditService] Chain lock error:", err));

    return this.chainLock;
  }

  async queryLogs(options: any = {}): Promise<DatabaseResult<AuditLogEntry[]>> {
    try {
      if (!dbAdapterInstance) throw new Error("Database not initialized");
      // Enforce tenant filtering on audit queries
      const filters = { ...options.filters };
      if (options.tenantId) {
        filters.tenantId = options.tenantId;
      }
      const limit = options.limit || 100;
      const offset = options.offset || 0;
      const sort = options.sort || { timestamp: -1 };

      // 🚀 ID-FIRST PAGINATION: For paginated queries with large details payloads,
      // fetch lightweight IDs first on MySQL/MariaDB to prevent sort_buffer_size overflow.
      const adapterType = (dbAdapterInstance as any).type;
      const isMySQLFamily = adapterType === "mariadb" || adapterType === "mysql";
      if (isMySQLFamily && offset > 0) {
        const idResult = await dbAdapterInstance.crud.findMany<any>(this.collectionName, filters, {
          limit,
          offset,
          tenantId: options.tenantId,
          fields: ["_id"],
          sort,
        });
        if (!idResult.success || !Array.isArray(idResult.data) || idResult.data.length === 0) {
          return idResult as any;
        }
        const ids = idResult.data.map((r: any) => r._id).filter(Boolean);
        return await dbAdapterInstance.crud.findMany<AuditLogEntry>(
          this.collectionName,
          { _id: { $in: ids } },
          {
            tenantId: options.tenantId,
            sort,
          },
        );
      }

      return await dbAdapterInstance.crud.findMany<AuditLogEntry>(this.collectionName, filters, {
        limit,
        offset,
        tenantId: options.tenantId,
        sort,
      });
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
export const queryAuditLogs = auditService.queryLogs.bind(auditService);
export const getLogs = auditService.getLogs.bind(auditService);
