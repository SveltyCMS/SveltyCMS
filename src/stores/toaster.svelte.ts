/**
 * @file src/stores/toaster.svelte.ts
 * @description Custom Lightweight Toaster Store using Svelte 5 Runes
 */

class ToasterStore {
	toasts = $state<
		{
			id: string;
			type: string;
			title?: string;
			description: string;
			duration?: number;
			createdAt: number; // Added to track when toast was created
			action?: { label: string; onClick: () => void };
		}[]
	>([]);

	constructor() {
		// Restore toasts from sessionStorage on initialization (Client-side only)
		if (typeof window !== 'undefined') {
			this.loadFromStorage();
		}
	}

	private saveToStorage() {
		if (typeof window === 'undefined') {
			return;
		}
		// Only persist toasts that don't have interactive actions (as functions can't be serialized)
		const persistableToasts = this.toasts
			.filter((t) => !t.action)
			.map((t) => ({
				id: t.id,
				type: t.type,
				title: t.title,
				description: t.description,
				duration: t.duration,
				createdAt: t.createdAt
			}));

		sessionStorage.setItem('persistentToasts', JSON.stringify(persistableToasts));
	}

	private loadFromStorage() {
		try {
			const saved = sessionStorage.getItem('persistentToasts');
			if (!saved) {
				return;
			}

			const parsed: any[] = JSON.parse(saved);
			const now = Date.now();
			const activeToasts: any[] = [];

			for (const t of parsed) {
				const elapsed = now - t.createdAt;
				const remaining = (t.duration || 5000) - elapsed;

				if (remaining > 0) {
					activeToasts.push(t);
					// Set up the auto-dismiss for the remaining time
					setTimeout(() => {
						this.close(t.id);
					}, remaining);
				}
			}

			this.toasts = activeToasts;
		} catch (e) {
			console.error('[ToasterStore] Failed to restore toasts:', e);
			sessionStorage.removeItem('persistentToasts');
		}
	}

	add(toast: {
		type?: 'success' | 'warning' | 'error' | 'info';
		title?: string;
		description: string;
		duration?: number;
		action?: { label: string; onClick: () => void };
	}) {
		// Robust ID generation
		const id =
			typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;

		const type = toast.type || 'info';
		const duration = toast.duration || 5000;
		const createdAt = Date.now();

		// Reassign to trigger granular reactivity immediately
		this.toasts = [
			...this.toasts,
			{
				id,
				type,
				title: toast.title,
				description: toast.description,
				duration,
				createdAt,
				action: toast.action
			}
		];

		// Persist state
		this.saveToStorage();

		if (duration > 0) {
			setTimeout(() => {
				this.close(id);
			}, duration);
		}

		return id;
	}

	success(t: string | { description: string; title?: string; duration?: number }) {
		return this.add({
			type: 'success',
			...(typeof t === 'string' ? { description: t } : t)
		});
	}

	error(t: string | { description: string; title?: string; duration?: number }) {
		return this.add({
			type: 'error',
			...(typeof t === 'string' ? { description: t } : t)
		});
	}

	warning(t: string | { description: string; title?: string; duration?: number }) {
		return this.add({
			type: 'warning',
			...(typeof t === 'string' ? { description: t } : t)
		});
	}

	info(t: string | { description: string; title?: string; duration?: number }) {
		return this.add({
			type: 'info',
			...(typeof t === 'string' ? { description: t } : t)
		});
	}

	close(id: string) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
		this.saveToStorage();
	}

	/**
	 * Checks for and processes a one-time "flashMessage" from sessionStorage.
	 * Typically used for messages that should appear after a redirect.
	 */
	checkFlash() {
		if (typeof window === 'undefined') {
			return;
		}

		try {
			const flashJson = sessionStorage.getItem('flashMessage');
			if (!flashJson) {
				return;
			}

			const flash = JSON.parse(flashJson);
			sessionStorage.removeItem('flashMessage');

			// Map flash message to toaster call
			const opts = {
				title: flash.title,
				description: flash.description || flash.message,
				duration: flash.duration || 3000
			};

			switch (flash.type) {
				case 'success':
					this.success(opts);
					break;
				case 'warning':
					this.warning(opts);
					break;
				case 'error':
					this.error(opts);
					break;
				default:
					this.info(opts);
					break;
			}
		} catch (e) {
			console.warn('[ToasterStore] Failed to parse flash message:', e);
			sessionStorage.removeItem('flashMessage');
		}
	}
}

export const toaster = new ToasterStore();
