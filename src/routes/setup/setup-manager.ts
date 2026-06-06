/**
 * @file src/routes/setup/setupManager.ts
 * @description Manages the setup state and progress tracking.
 */
import { logger } from "@utils/logger";

class SetupManager {
  private static instance: SetupManager;
  private _isSeeding = false;
  private _seedingError: string | null = null;
  private _seedingProgress = 0;

  private constructor() {}

  public static getInstance(): SetupManager {
    if (!SetupManager.instance) {
      SetupManager.instance = new SetupManager();
    }
    return SetupManager.instance;
  }

  get isSeeding() {
    return this._isSeeding;
  }

  set isSeeding(value: boolean) {
    this._isSeeding = value;
    if (value) {
      this._seedingError = null;
      this._seedingProgress = 0;
    }
  }

  get seedingError() {
    return this._seedingError;
  }

  set seedingError(value: string | null) {
    this._seedingError = value;
    this._isSeeding = false;
  }

  get progress() {
    return this._seedingProgress;
  }

  public updateProgress(completed: number, total: number) {
    this._seedingProgress = total > 0 ? Math.round((completed / total) * 100) : 0;
  }

  private _criticalQueue: Promise<unknown> = Promise.resolve();
  private _backgroundQueue: Promise<unknown> = Promise.resolve();

  // Starts a seeding task in the background and tracks its completion.
  // This is considered CRITICAL and will be waited for by completeSetup.
  public startSeeding(task: () => Promise<unknown>): void {
    this.isSeeding = true;
    const promise = (async () => {
      try {
        const result = await task();
        this.isSeeding = false;
        this._seedingProgress = 100;
        if (process.env.BENCHMARK_DEBUG === "true") {
          logger.info("🚀 Critical seeding successfully completed");
        }
        return result;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this._seedingError = msg;
        logger.error("❌ Critical seeding failed:", error);
        throw error;
      }
    })();
    this._criticalQueue = this._criticalQueue
      .then(() => promise)
      .catch(() => {
        logger.debug("Critical queue task failed silently");
      });
  }

  // Returns a promise that resolves when all currently queued CRITICAL background work is done.
  public async waitTillDone(): Promise<unknown> {
    let lastQueue;
    while (lastQueue !== this._criticalQueue) {
      lastQueue = this._criticalQueue;
      await lastQueue;
    }
    return null;
  }

  /**
   * Starts a background task that does NOT block the 'Complete' step.
   * Useful for heavy content seeding that can happen while the user is already in the CMS.
   */
  public startBackgroundWork(task: () => Promise<unknown>): void {
    const promise = (async () => {
      try {
        await task();
        if (process.env.BENCHMARK_DEBUG === "true") {
          logger.info("✨ Non-critical background task completed");
        }
      } catch (error) {
        logger.error("❌ Non-critical background task failed:", error);
      }
    })();
    this._backgroundQueue = this._backgroundQueue
      .then(() => promise)
      .catch(() => {
        logger.debug("Background queue task failed silently");
      });
  }

  /**
   * Waits for ALL work (critical + background) to be done.
   * Useful for tests or benchmarks.
   */
  public async waitAll(): Promise<unknown> {
    await this.waitTillDone();
    let lastQueue;
    while (lastQueue !== this._backgroundQueue) {
      lastQueue = this._backgroundQueue;
      await lastQueue;
    }
    return null;
  }
}

export const setupManager = SetupManager.getInstance();
