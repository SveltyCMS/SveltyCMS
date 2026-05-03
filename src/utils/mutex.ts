/**
 * @file src/utils/mutex.ts
 * @description Simple asynchronous mutex for serializing access to shared resources.
 */

export class Mutex {
  private promise: Promise<void> | null = null;

  /**
   * Acquires the lock. Returns a function to release it.
   */
  async lock(): Promise<() => void> {
    const previous = this.promise;
    let resolve: () => void;
    this.promise = new Promise((r) => {
      resolve = r;
    });

    if (previous) {
      await previous;
    }

    let released = false;
    return () => {
      if (!released) {
        released = true;
        resolve();
      }
    };
  }

  /**
   * Runs a function with the lock held.
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.lock();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Checks if the mutex is currently locked.
   */
  isLocked(): boolean {
    return this.promise !== null;
  }
}
