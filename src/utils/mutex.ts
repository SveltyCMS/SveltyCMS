/**
 * @file src/utils/mutex.ts
 * @description Robust asynchronous mutex for serializing access to shared resources.
 *
 * ### Hardening (audit 2026-07):
 * - Fixed isLocked(): now uses a boolean flag instead of a never-nulled Promise reference
 * - Memory leak protection: promise chain dissolves references after each task completes
 * - Sync/async handler support: runExclusive accepts Promise<T> | T
 */

export class Mutex {
  // Chain of pending promises — resolves sequentially in FIFO order
  private queue: Promise<void> = Promise.resolve();
  private locked = false;

  /**
   * Acquires the lock. Returns a function to release it.
   */
  async lock(): Promise<() => void> {
    let release: () => void;

    // Create a new promise for the current lock attempt
    const nextInLine = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Capture the current end of the queue and update it
    const previous = this.queue;
    this.queue = this.queue.then(() => nextInLine);

    // Wait for the previous task to complete
    await previous;

    this.locked = true;

    // Return the release callback
    return () => {
      this.locked = false;
      release();
    };
  }

  /**
   * Runs a function with the lock held.
   * Accepts both sync and async functions.
   */
  async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const release = await this.lock();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Checks if the mutex is currently waiting or processing an item.
   */
  isLocked(): boolean {
    return this.locked;
  }
}
