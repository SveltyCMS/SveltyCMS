/**
 * @file src/stores/systemPreferences.svelte.ts
 * @description User preferences with server persistence (Svelte 5 runes)
 */

import type { DashboardWidgetConfig, Layout } from '@src/content/types';
import { logger } from '@utils/logger';

const LAYOUT_KEY = 'dashboard.layout.default';

// --- API Helpers ---

async function fetchLayout(): Promise<Layout | null> {
	try {
		const res = await fetch(`/api/systemPreferences?key=${LAYOUT_KEY}`);
		if (res.status === 404) {
			logger.info('No saved dashboard layout, using default');
			return null;
		}
		if (!res.ok) {
			throw new Error(`Fetch failed: ${res.statusText}`);
		}
		return await res.json();
	} catch (e) {
		logger.error('Failed to fetch preferences:', e);
		throw e;
	}
}

async function saveLayout(layout: Layout): Promise<void> {
	try {
		const res = await fetch('/api/systemPreferences', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ key: LAYOUT_KEY, value: layout })
		});
		if (!res.ok) {
			throw new Error(`Save failed: ${res.statusText}`);
		}
	} catch (e) {
		logger.error('Failed to save preferences:', e);
		throw e;
	}
}

// --- Store ---

class PreferencesStore {
	preferences = $state<DashboardWidgetConfig[]>([]);
	loading = $state(true);
	error = $state<string | null>(null);

	async load() {
		this.loading = true;
		this.error = null;

		try {
			const layout = await fetchLayout();
			this.preferences = (layout?.preferences || []).map((w) => ({
				...w,
				size: w.size?.w && w.size?.h ? w.size : { w: 1, h: 1 }
			}));
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Unknown error';
			this.preferences = [];
		} finally {
			this.loading = false;
		}
	}

	async set(preferences: DashboardWidgetConfig[]) {
		this.preferences = preferences;
		await saveLayout({
			id: 'default',
			name: 'Default',
			preferences
		});
	}

	async updateWidget(widget: DashboardWidgetConfig) {
		const prefs = [...this.preferences];
		const idx = prefs.findIndex((w) => w.id === widget.id);

		if (idx > -1) {
			prefs[idx] = widget;
		} else {
			prefs.push(widget);
		}

		this.preferences = prefs;
		await saveLayout({ id: 'default', name: 'Default', preferences: prefs });
	}

	async updateWidgets(widgets: DashboardWidgetConfig[]) {
		const ordered = widgets.map((w, i) => ({ ...w, order: i }));
		this.preferences = ordered;
		await saveLayout({ id: 'default', name: 'Default', preferences: ordered });
	}

	async removeWidget(id: string) {
		const prefs = this.preferences.filter((w) => w.id !== id);
		this.preferences = prefs;
		await saveLayout({ id: 'default', name: 'Default', preferences: prefs });
	}

	// Compatibility aliases
	async loadPreferences() {
		return this.load();
	}

	async setPreferences(prefs: DashboardWidgetConfig[]) {
		return this.set(prefs);
	}
}

export const preferences = new PreferencesStore();
export const systemPreferences = preferences;
