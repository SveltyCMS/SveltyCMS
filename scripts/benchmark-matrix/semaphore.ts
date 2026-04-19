/**
 * @file scripts\benchmark-matrix\semaphore.ts
 * @description Semaphore utility for the benchmark matrix tool with observability.
 */

export class AsyncSemaphore {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private max: number) {
    if (max < 1) {
      this.max = 1;
    }
  }

  /**
   * Acquires a permit from the semaphore.
   */
  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise((r) => this.queue.push(r));
  }

  /**
   * Releases a permit back to the semaphore.
   */
  release(): void {
    if (this.active <= 0) {
      return; // Defensive guard
    }
    this.active--;
    if (this.queue.length > 0) {
      this.active++;
      const next = this.queue.shift();
      if (next) next();
    }
  }

  /**
   * Returns the number of currently active tasks.
   */
  getActiveCount(): number {
    return this.active;
  }

  /**
   * Returns the number of tasks waiting in the queue.
   */
  getWaitingCount(): number {
    return this.queue.length;
  }

  /**
   * Returns the maximum concurrency allowed.
   */
  getMaxConcurrency(): number {
    return this.max;
  }
}

/** Global lock for high-intensity tasks */
export const heavyTaskLock = new AsyncSemaphore(1);
