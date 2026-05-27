/** @file src/stores/toast.svelte.ts
 * @description Enterprise toast notification system with responsive positioning
 *
 * Features:
 * - responsive positioning
 * - flash messages
 * - pause-on-hover
 * - promise loading
 */

import { browser } from '$app/environment';
import { screen, ScreenSize } from './screen-size-store.svelte';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

// Responsive position that adapts to screen size
export type ToastPosition = 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center' | 'responsive';

export interface ToastAction {
	label: string;
	onClick: () => void;
}

export interface ToastOptions {
	type: ToastType;
	message: string;
	description?: string; // Backward compatibility with old Skeleton API
	title?: string;
	duration?: number | typeof Infinity;
	action?: ToastAction;
	persistent?: boolean;
	position?: ToastPosition; // Per-toast override
}

export interface Toast extends ToastOptions {
	id: string;
	duration: number | typeof Infinity;
	position?: ToastPosition;
	remainingTime: number;
	createdAt: number;
}

export interface ToastPromiseOptions<T> {
	loading: string;
	success: string | ((data: T) => string);
	error: string | ((error: unknown) => string);
}

// Responsive position configuration
export interface ResponsiveConfig {
	mobile: Exclude<ToastPosition, 'responsive'>;
	tablet: Exclude<ToastPosition, 'responsive'>;
	desktop: Exclude<ToastPosition, 'responsive'>;
}

const STORAGE_KEY = 'toast_queue_v2';
const FLASH_KEY = 'toast_flash';

// Default responsive positions
const DEFAULT_RESPONSIVE: ResponsiveConfig = {
	mobile: 'bottom-center', // Centered on small screens (thumb reach)
	tablet: 'bottom-right', // Standard position on tablets
	desktop: 'bottom-right' // Standard position on desktop
};

class ToastStore {
	toasts = $state<Toast[]>([]);
	position = $state<ToastPosition>('responsive'); // Global default

	private timers = new Map<string, number>();
	private paused = new Set<string>();
	private navigationInProgress = false;
	private maxToasts = 5;
	private responsiveConfig: ResponsiveConfig = DEFAULT_RESPONSIVE;
	private handlersInitialized = false;

	private priority: Record<ToastType, number> = {
		error: 4,
		warning: 3,
		success: 2,
		info: 1,
		loading: 0
	};

	get pausedIds(): ReadonlySet<string> {
		return this.paused;
	}

	get sortedToasts(): Toast[] {
		return [...this.toasts].sort((a, b) => this.priority[b.type] - this.priority[a.type]);
	}

	constructor() {
		if (browser) {
			this.hydrate();
		}
	}

	/** Initialize navigation handlers (must be called from onMount) */
	public init(): void {
		if (!browser || this.handlersInitialized) return;
		this.handlersInitialized = true;
		// Navigation handlers are now set up in +layout.svelte to avoid lifecycle errors
	}

	// ==========================================
	// RESPONSIVE POSITION LOGIC
	// ==========================================

	/** Get effective position based on screen size */
	getEffectivePosition(requested?: ToastPosition): Exclude<ToastPosition, 'responsive'> {
		const pos = requested ?? this.position;

		if (pos !== 'responsive') return pos;

		// Use screen store from your system
		const size = screen.size;

		if (size === ScreenSize.XS || size === ScreenSize.SM) {
			return this.responsiveConfig.mobile;
		}
		if (size === ScreenSize.MD) {
			return this.responsiveConfig.tablet;
		}
		return this.responsiveConfig.desktop;
	}

	/** Update responsive configuration */
	setResponsiveConfig(config: Partial<ResponsiveConfig>): void {
		this.responsiveConfig = { ...this.responsiveConfig, ...config };
	}

	/** Set global default position */
	setDefaultPosition(pos: ToastPosition): void {
		this.position = pos;
	}

	// ==========================================
	// PUBLIC API
	// ==========================================

	show(options: ToastOptions): string {
		const id = this.generateId();
		const toast = this.createToast(id, options);

		this.addToast(toast);
		return id;
	}

	private _handleLegacy(type: ToastType, msgOrOpts: string | Partial<ToastOptions & { description?: string }>, opts?: Partial<ToastOptions>): string {
		if (typeof msgOrOpts === 'string') {
			return this.show({ type, message: msgOrOpts, ...opts });
		}
		return this.show({
			type,
			message: msgOrOpts.message || msgOrOpts.description || '',
			...msgOrOpts,
			...opts
		});
	}

	success(msgOrOpts: string | Partial<ToastOptions>, opts?: Partial<ToastOptions>): string {
		return this._handleLegacy('success', msgOrOpts, opts);
	}

	error(msgOrOpts: string | Partial<ToastOptions>, opts?: Partial<ToastOptions>): string {
		return this._handleLegacy('error', msgOrOpts, { duration: opts?.duration ?? 6000, ...opts });
	}

	warning(msgOrOpts: string | Partial<ToastOptions>, opts?: Partial<ToastOptions>): string {
		return this._handleLegacy('warning', msgOrOpts, opts);
	}

	info(msgOrOpts: string | Partial<ToastOptions>, opts?: Partial<ToastOptions>): string {
		return this._handleLegacy('info', msgOrOpts, opts);
	}

	async promise<T>(promise: Promise<T>, options: ToastPromiseOptions<T>): Promise<T> {
		const id = this.show({
			type: 'loading',
			message: options.loading,
			duration: Infinity
		});

		try {
			const result = await promise;

			this.update(id, {
				type: 'success',
				message: typeof options.success === 'function' ? options.success(result) : options.success,
				duration: 3000
			});

			return result;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);

			this.update(id, {
				type: 'error',
				message: typeof options.error === 'function' ? options.error(err) : options.error || errorMessage,
				duration: 5000
			});

			throw err;
		}
	}

	flash(options: Omit<ToastOptions, 'createdAt' | 'remainingTime'>): void {
		if (!browser) return;

		const flashData = {
			...options,
			timestamp: Date.now()
		};

		sessionStorage.setItem(FLASH_KEY, JSON.stringify(flashData));
	}

	checkFlash(): void {
		if (!browser) return;

		const raw = sessionStorage.getItem(FLASH_KEY);
		if (!raw) return;

		sessionStorage.removeItem(FLASH_KEY);

		try {
			const flash = JSON.parse(raw);
			if (Date.now() - flash.timestamp < 10000) {
				this.show({
					type: flash.type,
					message: flash.message,
					title: flash.title,
					duration: flash.duration ?? 4000,
					action: flash.action,
					position: flash.position
				});
			}
		} catch (e) {
			console.error('[ToastStore] Invalid flash message:', e);
		}
	}

	update(id: string, updates: Partial<Toast>): void {
		const index = this.toasts.findIndex((t) => t.id === id);
		if (index === -1) return;

		this.toasts[index] = { ...this.toasts[index], ...updates };
		this.persist();

		if (updates.duration !== undefined || updates.type !== undefined) {
			this.resetTimer(id);
		}
	}

	close(id: string): void {
		this.clearTimer(id);
		this.toasts = this.toasts.filter((t) => t.id !== id);
		this.persist();
	}

	pause(id: string): void {
		if (this.paused.has(id)) return;

		this.paused.add(id);
		const toast = this.toasts.find((t) => t.id === id);
		if (!toast) return;

		const elapsed = Date.now() - toast.createdAt;
		toast.remainingTime = Math.max(0, toast.remainingTime - elapsed);

		this.clearTimer(id);
	}

	resume(id: string): void {
		if (!this.paused.has(id)) return;

		this.paused.delete(id);
		const toast = this.toasts.find((t) => t.id === id);
		if (!toast || toast.remainingTime <= 0) {
			this.close(id);
			return;
		}

		toast.createdAt = Date.now();
		this.setTimer(id, toast.remainingTime);
	}

	/** Check if a toast is currently paused */
	isPaused(id: string): boolean {
		return this.paused.has(id);
	}

	clear(): void {
		this.timers.forEach((timer) => clearTimeout(timer));
		this.timers.clear();
		this.paused.clear();
		this.toasts = [];
		this.persist();
	}

	// Error boundary handling for enterprise robustness
	setupErrorBoundary(): void {
		if (!browser) return;

		window.addEventListener('error', (e) => {
			this.error(e.message, {
				title: 'Unexpected Error',
				duration: 10000,
				action: {
					label: 'Dismiss',
					onClick: () => {}
				}
			});
		});

		window.addEventListener('unhandledrejection', (e) => {
			this.error(e.reason?.message || 'Promise rejected', {
				title: 'Async Error',
				duration: 8000
			});
		});
	}

	// Batch multiple toasts
	batch(items: Array<{ message: string; type: ToastType }>, opts?: { stagger?: number }): void {
		items.forEach((item, i) => {
			setTimeout(
				() => {
					this.show({ ...item, duration: 5000 });
				},
				i * (opts?.stagger ?? 200)
			);
		});
	}

	// ==========================================
	// PRIVATE METHODS
	// ==========================================

	private createToast(id: string, options: ToastOptions): Toast {
		const duration = options.duration ?? 4000;

		return {
			id,
			type: options.type,
			message: options.message,
			title: options.title,
			duration,
			remainingTime: duration,
			createdAt: Date.now(),
			action: options.action,
			persistent: options.persistent ?? false,
			position: options.position // Store requested position
		};
	}

	private addToast(toast: Toast): void {
		// Check for duplicate message within last 5 seconds to prevent spam
		const duplicate = this.toasts.find((t) => t.message === toast.message && t.type === toast.type && Date.now() - t.createdAt < 5000);

		if (duplicate) {
			this.update(duplicate.id, {
				title: toast.title,
				duration: toast.duration // trigger timer reset
			});
			return;
		}

		if (this.toasts.length >= this.maxToasts) {
			const removable = this.toasts.find((t) => !t.persistent);
			if (removable) this.close(removable.id);
		}

		this.toasts = [...this.toasts, toast];
		this.persist();

		if (!this.navigationInProgress && toast.duration !== Infinity) {
			this.setTimer(toast.id, toast.duration);
		}
	}

	private setTimer(id: string, ms: number): void {
		this.clearTimer(id);

		// Skip auto-removal in TEST_MODE for stable unit tests
		// Use typeof check to avoid 'Process is not defined' in browser
		if (typeof process !== 'undefined' && process.env?.TEST_MODE === 'true') {
			return;
		}

		const timer = window.setTimeout(() => {
			this.close(id);
		}, ms);

		this.timers.set(id, timer);
	}

	private clearTimer(id: string): void {
		const timer = this.timers.get(id);
		if (timer) {
			clearTimeout(timer);
			this.timers.delete(id);
		}
	}

	private resetTimer(id: string): void {
		const toast = this.toasts.find((t) => t.id === id);
		if (!toast || toast.duration === Infinity) return;

		toast.createdAt = Date.now();
		toast.remainingTime = toast.duration;
		this.setTimer(id, toast.duration);
	}

	private generateId(): string {
		return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	private persist(): void {
		if (!browser) return;

		const savable = this.toasts
			.filter((t) => t.persistent || t.remainingTime > 1000)
			.map((t) => ({
				id: t.id,
				type: t.type,
				message: t.message,
				title: t.title,
				duration: t.duration,
				remainingTime: t.remainingTime,
				createdAt: t.createdAt,
				persistent: t.persistent,
				position: t.position
			}));

		try {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(savable));
		} catch (e) {
			console.warn('[ToastStore] Failed to persist:', e);
		}
	}

	private hydrate(): void {
		try {
			const raw = sessionStorage.getItem(STORAGE_KEY);
			if (!raw) return;

			const parsed: Toast[] = JSON.parse(raw);
			const now = Date.now();
			const valid: Toast[] = [];

			for (const t of parsed) {
				const elapsed = now - t.createdAt;
				const remaining = t.remainingTime - elapsed;

				if (remaining > 0) {
					valid.push({
						...t,
						remainingTime: remaining,
						createdAt: now
					});
				}
			}

			this.toasts = valid;

			setTimeout(() => {
				valid.forEach((t) => {
					if (t.duration !== Infinity) {
						this.setTimer(t.id, t.remainingTime);
					}
				});
			}, 0);
		} catch (e) {
			console.error('[ToastStore] Hydration failed:', e);
			sessionStorage.removeItem(STORAGE_KEY);
		}
	}

	public handleBeforeNavigate(): void {
		this.navigationInProgress = true;

		const now = Date.now();
		this.toasts = this.toasts.map((t) => {
			if (t.duration === Infinity) return t;

			const elapsed = now - t.createdAt;
			return {
				...t,
				remainingTime: Math.max(0, t.remainingTime - elapsed),
				createdAt: now
			};
		});

		this.timers.forEach((timer) => clearTimeout(timer));
		this.timers.clear();

		this.persist();
	}

	public handleAfterNavigate(): void {
		this.navigationInProgress = false;

		this.toasts.forEach((t) => {
			if (t.duration !== Infinity && t.remainingTime > 0) {
				this.setTimer(t.id, t.remainingTime);
			}
		});

		this.persist();
	}
}

export const toast = new ToastStore();
