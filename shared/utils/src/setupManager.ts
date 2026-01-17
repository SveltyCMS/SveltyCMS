/**
 * @file src/routes/api/setup/setupManager.ts
 * @description Global singleton to track background setup processes.
 */

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
}

export const setupManager = SetupManager.getInstance();
