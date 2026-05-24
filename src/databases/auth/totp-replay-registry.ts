/**
 * @file src/databases/auth/totp-replay-registry.ts
 * @description TOTP Replay Attack Prevention Registry
 *
 * After a TOTP code passes mathematical validation, it is checked against
 * a registry of recently consumed codes. If already consumed within the
 * validity window, the code is rejected — preventing replay attacks.
 *
 * ### Design
 * - **Adapter pattern**: `TotpRegistryAdapter` interface allows swapping
 *   in-memory → SQLite → Redis without changing any call site.
 * - **TTL = 90s** (not 30s): covers the TOTP window (30s) + clock-skew
 *   buffer (±1 window = ±30s) = 90s total validity.
 * - **Fail-closed**: if the registry throws, the code is rejected.
 * - **Vague errors**: "Invalid or expired code" — never reveals whether
 *   the code was valid but already used.
 * - **Amortised cleanup**: expired entries are purged every ~100 writes
 *   to keep the table at steady-state size.
 *
 * ### Features:
 * - Atomic INSERT OR IGNORE semantics
 * - Adapter pattern for Redis/SQLite swappability
 * - Amortised cleanup strategy
 */

import { logger } from "@utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Full validity window for a TOTP code including clock-skew tolerance. */
export const TOTP_REPLAY_WINDOW_MS = 90_000; // 90 seconds

/** How often to run cleanup (every N insert attempts). */
const CLEANUP_INTERVAL = 100;

export interface TotpRegistryAdapter {
  /**
   * Attempt to atomically insert a consumed code.
   * @returns `true` if the code was NOT previously consumed (first use).
   *          `false` if the code was already in the registry (replay attack).
   */
  tryInsert(userId: string, code: string, expiresAt: number): Promise<boolean>;

  /**
   * Delete all expired entries. Called periodically by the registry.
   */
  deleteExpired(): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-Memory Adapter (single-instance deployments)
// ---------------------------------------------------------------------------

interface ConsumedEntry {
  userId: string;
  code: string;
  expiresAt: number;
}

export class InMemoryTotpRegistryAdapter implements TotpRegistryAdapter {
  private _store = new Map<string, ConsumedEntry>();

  private _makeKey(userId: string, code: string): string {
    return `${userId}:${code}`;
  }

  async tryInsert(userId: string, code: string, expiresAt: number): Promise<boolean> {
    const key = this._makeKey(userId, code);

    // Check for existing non-expired entry (atomic at the JS level since
    // this runs in a single-threaded event loop)
    const existing = this._store.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      return false; // replay detected
    }

    this._store.set(key, { userId, code, expiresAt });
    return true;
  }

  async deleteExpired(): Promise<void> {
    const now = Date.now();
    for (const [key, entry] of this._store) {
      if (entry.expiresAt <= now) {
        this._store.delete(key);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// UsedTotpCodeRegistry (facade)
// ---------------------------------------------------------------------------

/**
 * High-level registry that wraps a TotpRegistryAdapter and handles
 * amortised cleanup and error resilience.
 */
export class UsedTotpCodeRegistry {
  private _adapter: TotpRegistryAdapter;
  private _writeCount = 0;

  constructor(adapter: TotpRegistryAdapter) {
    this._adapter = adapter;
  }

  /**
   * Check whether a code has been consumed. If not, record it.
   *
   * @returns `true` if the code is accepted (first use).
   *          `false` if it was a replay or an error occurred.
   */
  async consumeCode(userId: string, code: string): Promise<boolean> {
    const expiresAt = Date.now() + TOTP_REPLAY_WINDOW_MS;

    try {
      const accepted = await this._adapter.tryInsert(userId, code, expiresAt);

      // Amortised cleanup: every CLEANUP_INTERVAL writes, purge expired entries
      this._writeCount++;
      if (this._writeCount >= CLEANUP_INTERVAL) {
        this._writeCount = 0;
        this._adapter.deleteExpired().catch((err) => {
          logger.warn("TOTP replay registry cleanup failed (non-fatal)", err);
        });
      }

      return accepted;
    } catch (err) {
      // Fail-closed: if the registry is unavailable, reject the code.
      // A transient DB error should not disable replay protection.
      logger.error("TOTP replay registry error — rejecting code (fail-closed)", err);
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _defaultRegistry: UsedTotpCodeRegistry | null = null;

/**
 * Get or create the default registry instance.
 * Currently uses in-memory adapter. Swap to Redis/SQLite for multi-instance.
 */
export function getTotpReplayRegistry(): UsedTotpCodeRegistry {
  if (!_defaultRegistry) {
    _defaultRegistry = new UsedTotpCodeRegistry(new InMemoryTotpRegistryAdapter());
  }
  return _defaultRegistry;
}

/**
 * Reset the singleton (useful for testing).
 */
export function resetTotpReplayRegistry(): void {
  _defaultRegistry = null;
}
