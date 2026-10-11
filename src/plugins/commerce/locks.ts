/**
 * @file src/plugins/commerce/locks.ts
 * @description In-process keyed async mutex for commerce critical sections.
 *
 * `CommerceStore` is read-modify-write (`findOne` → merge → `update`), so a
 * stock decrement or an idempotent replay must be serialized per key or two
 * concurrent requests interleave and both pass the same guard (the oversell
 * race). This serializes same-key work in FIFO order within one Node process —
 * the common single-node deployment. Multi-node needs a DB-level conditional
 * update, tracked in the roadmap.
 *
 * ### Features:
 * - FIFO per key (reuses the audited `@utils/mutex` Mutex)
 * - reference-counted reclaim so an idle key's entry does not leak
 */

import { Mutex } from "@utils/mutex";

interface LockEntry {
  mutex: Mutex;
  refs: number;
}

const locks = new Map<string, LockEntry>();

/**
 * Run `fn` while holding the lock for `key`. Same-key calls run one at a time
 * (FIFO); different keys never block each other.
 */
export function withKeyLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
  let entry = locks.get(key);
  if (!entry) {
    entry = { mutex: new Mutex(), refs: 0 };
    locks.set(key, entry);
  }
  entry.refs++;
  const current = entry;
  return current.mutex.runExclusive(fn).finally(() => {
    current.refs--;
    if (current.refs === 0 && locks.get(key) === current) locks.delete(key);
  });
}

/** Product-scoped lock key — one stock mutation at a time per tenant product. */
export function productLockKey(tenantId: string, productId: string): string {
  return `${tenantId || "global"}:product:${productId}`;
}

/** Test-only: drop all lock state so an in-flight key cannot leak between tests. */
export function resetCommerceLocks(): void {
  locks.clear();
}
