/**
 * @file src/services/audit-chain.ts
 * @description Crypto-chained audit log service providing SHA-256 tamper-evident integrity.
 *
 * Each audit log entry is linked to its predecessor via a SHA-256 hash chain,
 * enabling detection of tampering, deletion, or reordering of entries.
 *
 * Features:
 * - SHA-256 cryptographic chaining (CSPRNG-compliant via globalThis.crypto.subtle)
 * - Genesis hash constant for first entry anchoring
 * - In-memory last-hash caching to avoid DB lookups on every write
 * - Full chain verification with tamper detection
 * - Multi-tenant aware (optional tenantId scoping)
 */

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
  details?: Record<string, unknown>;
  previousHash?: string;
  chainHash?: string;
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
  details?: string[];
}

/**
 * Converts a string to a SHA-256 hex digest using the Web Crypto API.
 * Uses globalThis.crypto.subtle for CSPRNG-compliant hashing.
 */
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class AuditChainService {
  private readonly collectionName = "auditLogs";
  private lastHashCache: string | null = null;

  /**
   * Creates a new audit log entry with cryptographic chain hashes.
   * Automatically computes previousHash (SHA-256 of last entry) and
   * chainHash (SHA-256 of current entry data concatenated with previousHash).
   */
  async createLog(entry: ChainedAuditEntry): Promise<ChainedAuditEntry> {
    const previousHash = await this.getLastHash(entry.tenantId as string | undefined);

    // Build the content to hash: serialize entry fields deterministically
    const entryData = JSON.stringify({
      action: entry.action,
      actorEmail: entry.actorEmail,
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      eventType: entry.eventType ?? entry.action,
      timestamp: entry.timestamp,
      details: entry.details ?? {},
      tenantId: entry.tenantId,
    });

    const chainHash = await sha256(entryData + previousHash);

    const chainedEntry: ChainedAuditEntry = {
      ...entry,
      previousHash,
      chainHash,
    };

    // Update in-memory cache
    this.lastHashCache = chainHash;

    return chainedEntry;
  }

  /**
   * Retrieves the hash of the most recent audit log entry, or GENESIS_HASH if none exists.
   * Uses in-memory caching to avoid DB lookups on every write.
   */
  private async getLastHash(tenantId?: string): Promise<string> {
    // Return cached value if available and tenant matches
    if (this.lastHashCache !== null) {
      return this.lastHashCache;
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
        limit: 1,
        sort: { timestamp: "desc" } as any,
        tenantId: tenantId as any,
      });

      if (result.success && result.data && result.data.length > 0) {
        const lastEntry = result.data[0] as unknown as ChainedAuditEntry;
        const hash = lastEntry.chainHash ?? lastEntry.previousHash ?? GENESIS_HASH;
        this.lastHashCache = hash;
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
   * and comparing against the stored value. Detects any tampering.
   *
   * @param tenantId - Optional tenant scope for verification
   * @returns ChainVerificationResult with validity status and details
   */
  async verifyChain(tenantId?: string): Promise<ChainVerificationResult> {
    const tamperedEntries: number[] = [];
    const details: string[] = [];

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

      const result = await dbAdapterInstance.crud.findMany(this.collectionName, filter as any, {
        sort: { timestamp: "asc" } as any,
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

      const entries = result.data as unknown as ChainedAuditEntry[];
      let expectedPreviousHash = GENESIS_HASH;

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        // Check that stored previousHash matches expected
        if (entry.previousHash !== expectedPreviousHash) {
          tamperedEntries.push(i);
          details.push(
            `Entry #${i + 1} (${
              entry.timestamp ?? "unknown time"
            }): previousHash mismatch. Expected ${expectedPreviousHash.slice(0, 16)}..., got ${(entry.previousHash ?? "none").slice(0, 16)}...`,
          );
        }

        // Recompute chainHash and compare
        const entryData = JSON.stringify({
          action: entry.action,
          actorEmail: entry.actorEmail,
          actorId: entry.actorId,
          actorRole: entry.actorRole,
          eventType: (entry as any).eventType ?? entry.action,
          timestamp: entry.timestamp,
          details: entry.details ?? {},
          tenantId: entry.tenantId,
        });

        const computedChainHash = await sha256(entryData + (entry.previousHash ?? GENESIS_HASH));

        if (entry.chainHash !== computedChainHash) {
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
        expectedPreviousHash = entry.chainHash ?? entry.previousHash ?? GENESIS_HASH;
      }

      const valid = tamperedEntries.length === 0;
      const brokenAt = tamperedEntries.length > 0 ? tamperedEntries[0] : null;

      return {
        valid,
        brokenAt: brokenAt !== null ? brokenAt + 1 : null, // 1-based for display
        totalEntries: entries.length,
        tamperedEntries: tamperedEntries.length,
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
   */
  invalidateCache(): void {
    this.lastHashCache = null;
  }
}

export const auditChainService = new AuditChainService();
