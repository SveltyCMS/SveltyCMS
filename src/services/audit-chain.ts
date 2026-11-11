/**
 * @file src/services/audit-chain.ts
 * @description Crypto-chained audit log service providing SHA-256 tamper-evident integrity.
 *
 * Each audit log entry is linked to its predecessor via a SHA-256 hash chain,
 * enabling detection of tampering, deletion, or reordering of entries.
 *
 * Features:
 * - SHA-256 cryptographic chaining (`node:crypto`, synchronous, ~2µs/entry)
 * - Genesis hash constant for first entry anchoring
 * - Tenant-keyed in-memory last-hash cache to avoid DB lookups on every write
 * - Per-tenant in-process mutex so concurrent writers cannot fork the chain
 * - ONE canonical payload function shared by writer and verifier
 * - Full chain verification with tamper detection
 * - Multi-tenant aware (tenantId scoping; untenanted writes share `__global__`)
 *
 * ### Multi-process deployments
 * `withTenantLock` only serialises writers inside *this* process. A deployment
 * that runs several Node processes against one database (cluster mode, PM2,
 * more than one container) can still have two processes read the same
 * predecessor hash and fork the chain. Such deployments need a DB-level guard —
 * e.g. `SELECT ... FOR UPDATE` on the tenant's chain head inside the same
 * transaction that inserts the new entry, or a unique index on
 * `(tenantId, previousHash)`. The single-process guarantee here is documented,
 * not assumed silently.
 */

import { createHash } from "node:crypto";
import { dbAdapter as dbAdapterInstance } from "@src/databases/db";
import { logger } from "@utils/logger";

/** Genesis hash: 64 zero-hex characters, the anchor for the first entry in the chain */
export const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

/** Interface for an audit log entry with chain fields */
export interface ChainedAuditEntry {
  _id?: string;
  action: string;
  actorEmail?: string;
  actorId?: string | null;
  actorRole?: string;
  tenantId?: string | null;
  timestamp?: string;
  severity?: string;
  result?: string;
  targetId?: string | null;
  targetType?: string | null;
  details?: Record<string, unknown>;
  previousHash?: string;
  chainHash?: string;
  /** Legacy alias kept for rows written before `chainHash` existed. */
  hash?: string;
  eventType?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  [key: string]: unknown;
}

/** Result of a chain verification */
export interface ChainVerificationResult {
  valid: boolean;
  brokenAt: number | null;
  totalEntries: number;
  tamperedEntries: number;
  /** Leading rows written before the chain existed (skipped, not tampered). */
  unchainedPrefix?: number;
  details?: string[];
}

/**
 * The fields covered by the chain hash, in the order they are committed to.
 * The list is used by the writer, the verifier and the Merkle helpers — a
 * writer/verifier field mismatch is the classic way a hash chain becomes
 * permanently "tampered", so both sides call `canonicalAuditPayload()`.
 */
export const AUDIT_CHAIN_FIELDS = [
  "action",
  "actorEmail",
  "actorId",
  "actorRole",
  "eventType",
  "severity",
  "result",
  "targetId",
  "targetType",
  "timestamp",
  "details",
  "tenantId",
] as const;

/**
 * JSON with object keys sorted at every level.
 *
 * Determinism matters twice: the writer and the verifier must serialise the
 * same object identically, and some backends (MariaDB/MySQL JSON) reorder
 * object keys on storage. Sorting makes the payload independent of both.
 */
function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value !== "object") return JSON.stringify(value) as string;
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Ids round-trip through VARCHAR columns, so always compare them as strings. */
function normalizeScalar(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Timestamps are hashed exactly as written; Date instances are normalised to ISO. */
function normalizeTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Date(value).toISOString();
  return String(value);
}

/**
 * `details` may come back from a backend as either a parsed object or the raw
 * JSON text (SQLite TEXT column without a JSON parser). Both shapes must hash
 * the same, so a string is parsed when possible.
 */
function normalizeDetails(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return value as Record<string, unknown>;
}

/**
 * The single canonical payload that the chain hash commits to.
 * Writer (`append`) and verifier (`verifyChain`) both call this — never
 * serialise the raw entry yourself.
 *
 * The top-level key order is fixed literals (alphabetical, matching
 * `AUDIT_CHAIN_FIELDS`) rather than a per-call `Object.keys().sort()`: this
 * runs on every audit write, and the key set is constant. `details` is
 * free-form, so it alone goes through `stableStringify`.
 */
export function canonicalAuditPayload(entry: ChainedAuditEntry): string {
  const action = entry.action ?? "";
  return JSON.stringify({
    action,
    actorEmail: entry.actorEmail ?? null,
    actorId: normalizeScalar(entry.actorId),
    actorRole: entry.actorRole ?? null,
    eventType: entry.eventType ?? action,
    severity: entry.severity ?? null,
    result: entry.result ?? null,
    targetId: normalizeScalar(entry.targetId),
    targetType: entry.targetType ?? null,
    timestamp: normalizeTimestamp(entry.timestamp),
    details: stableStringify(normalizeDetails(entry.details)),
    tenantId: normalizeScalar(entry.tenantId),
  });
}

/**
 * chainHash = SHA-256(canonicalPayload + previousHash) as lowercase hex.
 * Synchronous so the append hot path costs one hash, no event-loop hop.
 */
export function computeChainHash(entry: ChainedAuditEntry, previousHash: string): string {
  return createHash("sha256")
    .update(canonicalAuditPayload(entry) + previousHash)
    .digest("hex");
}

export class AuditChainService {
  private readonly collectionName = "auditLogs";
  /** Last chained hash per tenant — a single shared slot would link one tenant's
   *  entry to another tenant's predecessor. `__global__` keys untenanted writes. */
  private readonly lastHashCache = new Map<string, string>();
  /** Per-tenant tail of the write queue (in-process mutex, see file header). */
  private readonly tenantLocks = new Map<string, Promise<void>>();

  private static cacheKey(tenantId?: string | null): string {
    return tenantId || "__global__";
  }

  /**
   * Runs `fn` after every previously queued append for the same tenant.
   * The tail never rejects, so one failed append cannot poison the queue.
   */
  private async withTenantLock<T>(
    tenantId: string | null | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    const key = AuditChainService.cacheKey(tenantId);
    const previous = this.tenantLocks.get(key) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.tenantLocks.set(key, tail);
    try {
      return await run;
    } finally {
      // Drop the slot when this append is the last one queued, otherwise the
      // map would grow one entry per tenant forever.
      if (this.tenantLocks.get(key) === tail) {
        this.tenantLocks.delete(key);
      }
    }
  }

  /**
   * Chains one audit entry: reads the tenant's chain head, computes
   * `previousHash` + `chainHash`, and advances the cached head — all under the
   * per-tenant lock. O(1) on the hot path (one SHA-256, no DB round-trip once
   * the tenant head is cached).
   */
  async append(entry: ChainedAuditEntry): Promise<ChainedAuditEntry> {
    const tenantId = (entry.tenantId as string | null | undefined) ?? null;
    const cacheKey = AuditChainService.cacheKey(tenantId);
    return this.withTenantLock(tenantId, async () => {
      // Steady state: the head is cached, so no DB round-trip and no extra
      // async hop on the hot path (the async read happens once per tenant).
      const previousHash = this.lastHashCache.get(cacheKey) ?? (await this.getLastHash(tenantId));
      const chainHash = computeChainHash(entry, previousHash);
      this.lastHashCache.set(cacheKey, chainHash);
      return { ...entry, previousHash, chainHash };
    });
  }

  /**
   * Creates a new audit log entry with cryptographic chain hashes.
   * Kept for API compatibility: identical to `append()`.
   */
  async createLog(entry: ChainedAuditEntry): Promise<ChainedAuditEntry> {
    return this.append(entry);
  }

  /**
   * Retrieves the hash of the most recent audit log entry, or GENESIS_HASH if none exists.
   * Uses in-memory caching to avoid DB lookups on every write.
   */
  private async getLastHash(tenantId?: string | null): Promise<string> {
    const cacheKey = AuditChainService.cacheKey(tenantId);
    // Return cached value if available and tenant matches
    const cached = this.lastHashCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    try {
      if (!dbAdapterInstance) {
        return GENESIS_HASH;
      }

      const filter: Record<string, unknown> = {};
      if (tenantId) {
        filter.tenantId = tenantId;
      }

      const result = await dbAdapterInstance.crud.findMany(this.collectionName, filter as any, {
        // One row is enough for both scopes. `tenantId: null` is the explicit
        // *global* scope (`tenantId IS NULL`, see `getTenantCondition` in
        // `relational-utils` and the documented explicit global scope in
        // safe-query) — it is not "unfiltered" — so the head read cannot land on
        // a tenant's row and no defensive window scan is needed.
        limit: 1,
        // `_id` breaks timestamp ties: `nowISODateString()` is cached per
        // millisecond, so a write burst shares one timestamp and a timestamp-only
        // ORDER BY may hand back an earlier entry of that millisecond as the head.
        // `_id` is UUIDv7 (write order), so the tiebreak is chronological.
        sort: { timestamp: "desc", _id: "desc" } as any,
        tenantId: tenantId as any,
      });

      const rows = (result.success && result.data
        ? result.data
        : []) as unknown as ChainedAuditEntry[];
      const lastEntry = rows[0];

      if (lastEntry) {
        const hash = lastEntry.chainHash ?? lastEntry.previousHash ?? GENESIS_HASH;
        this.lastHashCache.set(cacheKey, hash);
        return hash;
      }
    } catch (err) {
      logger.debug("[AuditChain] Could not query last hash, using genesis", err);
    }

    return GENESIS_HASH;
  }

  /**
   * Verifies the entire audit chain for integrity.
   * Walks all entries sorted by timestamp, recomputing chainHash for each
   * with the same canonical payload the writer used, and comparing against the
   * stored value. Detects any tampering.
   *
   * Rows written before the chain existed (no chainHash/previousHash at all)
   * are skipped only as a prefix: once the chain has started, a row without a
   * chain hash is an integrity failure, not "legacy data".
   *
   * @param tenantId - Optional tenant scope for verification
   * @returns ChainVerificationResult with validity status and details
   */
  async verifyChain(tenantId?: string): Promise<ChainVerificationResult> {
    const tamperedEntries: number[] = [];
    const details: string[] = [];
    let unchainedPrefix = 0;

    try {
      if (!dbAdapterInstance) {
        return {
          valid: false,
          brokenAt: 0,
          totalEntries: 0,
          tamperedEntries: 0,
          details: ["Database adapter not initialized"],
        };
      }

      // Fetch all entries sorted by timestamp ascending to walk the chain
      const filter: Record<string, unknown> = {};
      if (tenantId) {
        filter.tenantId = tenantId;
      }

      // Walk in write order. `timestamp` alone is not enough: `nowISODateString()`
      // is cached per millisecond, so a burst of entries carries the same timestamp
      // and the tie order is adapter-defined — the walk would then differ from the
      // write order and report a fork that never happened. `_id` (UUIDv7) is the
      // chronological tiebreak.
      const result = await dbAdapterInstance.crud.findMany(this.collectionName, filter as any, {
        sort: { timestamp: "asc", _id: "asc" } as any,
        limit: 10000, // Large batch for chain verification
        tenantId: tenantId as any,
      });

      if (!result.success) {
        return {
          valid: false,
          brokenAt: 0,
          totalEntries: 0,
          tamperedEntries: 0,
          details: [result.message],
        };
      }

      if (!result.data) {
        return {
          valid: false,
          brokenAt: 0,
          totalEntries: 0,
          tamperedEntries: 0,
          details: ["No data returned from audit logs"],
        };
      }

      const entries = (result.data as unknown as ChainedAuditEntry[]).filter(
        // Chains are per tenant. An untenanted verification must not walk
        // tenanted rows: the tenant boundary would read as a chain break.
        (entry) => (entry.tenantId ?? null) === (tenantId ?? null),
      ) as ChainedAuditEntry[];
      let expectedPreviousHash = GENESIS_HASH;
      let sawChained = false;

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const storedChainHash =
          typeof entry.chainHash === "string" && entry.chainHash.length > 0
            ? entry.chainHash
            : typeof entry.hash === "string" && entry.hash.length > 0
              ? entry.hash
              : null;

        // Pre-chain rows: only tolerable before the chain has started.
        if (!sawChained && storedChainHash === null && !entry.previousHash) {
          unchainedPrefix++;
          continue;
        }
        sawChained = true;

        // Check that stored previousHash matches expected
        if (entry.previousHash !== expectedPreviousHash) {
          tamperedEntries.push(i);
          details.push(
            `Entry #${i + 1} (${
              entry.timestamp ?? "unknown time"
            }): previousHash mismatch. Expected ${expectedPreviousHash.slice(0, 16)}..., got ${(entry.previousHash ?? "none").slice(0, 16)}...`,
          );
        }

        // Recompute chainHash with the shared canonical payload
        const computedChainHash = computeChainHash(entry, entry.previousHash ?? GENESIS_HASH);

        if (storedChainHash !== computedChainHash) {
          if (!tamperedEntries.includes(i)) {
            tamperedEntries.push(i);
          }
          details.push(
            `Entry #${i + 1} (${
              entry.timestamp ?? "unknown time"
            }): chainHash mismatch. Entry may have been modified.`,
          );
        }

        // Set expected previous hash for next iteration
        expectedPreviousHash = storedChainHash ?? entry.previousHash ?? GENESIS_HASH;
      }

      const valid = tamperedEntries.length === 0;
      const brokenAt = tamperedEntries.length > 0 ? tamperedEntries[0] : null;

      return {
        valid,
        brokenAt: brokenAt !== null ? brokenAt + 1 : null, // 1-based for display
        totalEntries: entries.length,
        tamperedEntries: tamperedEntries.length,
        unchainedPrefix,
        details: details.length > 0 ? details : undefined,
      };
    } catch (err) {
      logger.error("[AuditChain] Chain verification failed", err);
      return {
        valid: false,
        brokenAt: null,
        totalEntries: 0,
        tamperedEntries: 0,
        details: [String(err)],
      };
    }
  }

  /**
   * Invalidates the in-memory hash cache (e.g., after a DB restore or manual change).
   * Pass a tenant to drop only that tenant's entry.
   */
  invalidateCache(tenantId?: string | null): void {
    if (tenantId === undefined) {
      this.lastHashCache.clear();
      return;
    }
    this.lastHashCache.delete(AuditChainService.cacheKey(tenantId));
  }

  /**
   * Computes the Merkle Root Hash for an array of audit log entries.
   * Provides O(log N) cryptographic proof of log batch integrity.
   */
  async computeMerkleRoot(entries: ChainedAuditEntry[]): Promise<string> {
    if (!entries || entries.length === 0) {
      return GENESIS_HASH;
    }

    let level: string[] = [];
    for (const entry of entries) {
      level.push(computeChainHash(entry, entry.previousHash ?? GENESIS_HASH));
    }

    while (level.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : left;
        nextLevel.push(
          createHash("sha256")
            .update(left + right)
            .digest("hex"),
        );
      }
      level = nextLevel;
    }

    return level[0];
  }

  /**
   * Generates an audit inclusion proof for a specific audit log index in a batch.
   */
  async generateMerkleProof(
    entries: ChainedAuditEntry[],
    targetIndex: number,
  ): Promise<{ position: "left" | "right"; hash: string }[]> {
    if (!entries || targetIndex < 0 || targetIndex >= entries.length) {
      return [];
    }

    const proof: { position: "left" | "right"; hash: string }[] = [];
    let level: string[] = [];
    for (const entry of entries) {
      level.push(computeChainHash(entry, entry.previousHash ?? GENESIS_HASH));
    }

    let index = targetIndex;

    while (level.length > 1) {
      const nextLevel: string[] = [];
      const isRight = index % 2 === 1;
      const siblingIndex = isRight ? index - 1 : index + 1 < level.length ? index + 1 : index;

      if (siblingIndex !== index) {
        proof.push({
          position: isRight ? "left" : "right",
          hash: level[siblingIndex],
        });
      }

      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : left;
        nextLevel.push(
          createHash("sha256")
            .update(left + right)
            .digest("hex"),
        );
      }

      level = nextLevel;
      index = Math.floor(index / 2);
    }

    return proof;
  }
}

export const auditChainService = new AuditChainService();
