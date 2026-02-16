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
			action?: { label: string; onClick: () => void };
		}[]
	>([]);

	constructor() {}

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

		// Reassign to trigger granular reactivity immediately
		this.toasts = [
			...this.toasts,
			{
				id,
				type,
				title: toast.title,
				description: toast.description,
				duration,
				action: toast.action
			}
		];

		if (duration > 0) {
			setTimeout(() => {
				this.close(id);
			}, duration);
		}

		return id;
	}

	success(t: string | { description: string; title?: string; duration?: number }) {
		return this.add({ type: 'success', ...(typeof t === 'string' ? { description: t } : t) });
	}

	error(t: string | { description: string; title?: string; duration?: number }) {
		return this.add({ type: 'error', ...(typeof t === 'string' ? { description: t } : t) });
	}

	warning(t: string | { description: string; title?: string; duration?: number }) {
		return this.add({ type: 'warning', ...(typeof t === 'string' ? { description: t } : t) });
	}

	info(t: string | { description: string; title?: string; duration?: number }) {
		return this.add({ type: 'info', ...(typeof t === 'string' ? { description: t } : t) });
	}

	close(id: string) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}
}

export const toaster = new ToasterStore();
