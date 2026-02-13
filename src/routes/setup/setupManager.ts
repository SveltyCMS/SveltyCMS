/**
 * @file src/routes/setup/setupManager.ts
 * @description Manages the setup state and progress tracking.
 */
import { logger } from '@utils/logger';

class SetupManager {
	private static instance: SetupManager;
	private _isSeeding = false;
	private _seedingError: string | null = null;
	private _seedingProgress = 0;
	// Store the background seeding promise
	private _seedingPromise: Promise<unknown> | null = null;

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

	/**
	 * Starts a seeding task in the background and tracks its completion.
	 */
	public startSeeding(task: () => Promise<unknown>): void {
		this.isSeeding = true;
		this._seedingPromise = (async () => {
			try {
				const result = await task();
				this.isSeeding = false;
				this._seedingProgress = 100;
				logger.info('🚀 Seeding successfully completed in background');
				return result;
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				this.seedingError = msg;
				logger.error('❌ Background seeding failed:', error);
				throw error;
			}
		})();
	}

	/**
	 * Returns the current seeding promise or null.
	 */
	public async waitTillDone(): Promise<unknown> {
		if (this._seedingPromise) {
			return this._seedingPromise;
		}
		return null;
	}

	/**
	 * Starts a valid background task that does NOT block completeSetup.
	 * Used for heavy content seeding that can happen post-setup.
	 */
	public startBackgroundWork(task: () => Promise<unknown>): void {
		// Fire and forget, but handle errors
		(async () => {
			try {
				await task();
				logger.info('✨ Background setup task completed successfully');
			} catch (error) {
				logger.error('❌ Background setup task failed:', error);
			}
		})();
	}
}

export const setupManager = SetupManager.getInstance();
