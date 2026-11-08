/**
 * @file src/services/sdk/namespaces/collections/transaction-context.ts
 * @description Adapter transaction plumbing shared by the collections write lane.
 *
 * The write lane normally performs one atomic statement per call. Callers that
 * must group several writes — publish promotion: live row + revision snapshot +
 * draft delete — pass an adapter transaction handle and a post-commit effect
 * queue through the same options bag. Every other caller leaves both unset and
 * keeps the historical single-statement path.
 *
 * ### Features:
 * - `transactionOf` reads an adapter handle without widening `LocalApiOptions`
 * - `runAfterCommit` runs cache/outbox/hook effects only after the transaction lands
 * - `afterCommitQueueOf` exposes the queue to `persistWithOutbox`
 */
import type { LocalApiOptions } from "../types";

/**
 * Options bag widened by transactional callers. `LocalApiOptions` stays
 * untouched so the public SDK surface does not advertise a handle callers
 * cannot obtain; promotion builds this shape internally.
 */
export interface TransactionalWriteOptions extends LocalApiOptions {
  /** Adapter-specific handle passed to `IDBAdapter.transaction`. */
  transaction?: unknown;
  /**
   * Post-write effects (cache invalidation, outbox, pubsub, afterSave hooks)
   * collected while the transaction is open and replayed only after commit.
   * Dropped when the transaction rolls back.
   */
  afterCommit?: Array<() => void>;
}

/** The adapter transaction handle threaded by a transactional caller, if any. */
export function transactionOf(options: LocalApiOptions): unknown {
  return (options as TransactionalWriteOptions).transaction;
}

/** The deferred-effect queue of a transactional caller, if any. */
export function afterCommitQueueOf(options: LocalApiOptions): Array<() => void> | undefined {
  return (options as TransactionalWriteOptions).afterCommit;
}

/**
 * Run `effect` immediately on the standalone path, or queue it for the caller to
 * replay after a successful commit. A transaction without a queue cannot be
 * deferred safely, so the effect is dropped rather than emitted against a write
 * that may roll back.
 */
export function runAfterCommit(options: LocalApiOptions, effect: () => void): void {
  const queue = afterCommitQueueOf(options);
  if (!transactionOf(options)) {
    effect();
    return;
  }
  queue?.push(effect);
}
