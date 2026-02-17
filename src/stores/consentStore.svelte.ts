/**
 * @file src/stores/consentStore.svelte.ts
 * @description Global store for managing user consent preferences (GDPR).
 * Uses Svelte 5 runes for fine-grained reactivity.
 */
import { browser } from '$app/environment';

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing';

export interface ConsentState {
	analytics: boolean;
	marketing: boolean;
	necessary: boolean; // Always true
	responded: boolean; // True if user has made a choice (accepted/rejected/custom)
}

const STORAGE_KEY = 'sveltycms_consent';

function createConsentStore() {
	// Initialize with defaults
	let state = $state<ConsentState>({
		necessary: true,
		analytics: false,
		marketing: false,
		responded: false
	});

	// Load from localStorage on client-side mount
	if (browser) {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			try {
				const parsed = JSON.parse(stored);
				state = { ...state, ...parsed, necessary: true }; // Ensure necessary is always true
			} catch (e) {
				console.error('Failed to parse consent cookie', e);
			}
		}
	}

	function save() {
		if (browser) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		}
	}

	return {
		get necessary() {
			return state.necessary;
		},
		get analytics() {
			return state.analytics;
		},
		get marketing() {
			return state.marketing;
		},
		get responded() {
			return state.responded;
		},

		acceptAll: () => {
			state.analytics = true;
			state.marketing = true;
			state.responded = true;
			save();
		},

		rejectAll: () => {
			state.analytics = false;
			state.marketing = false;
			state.responded = true;
			save();
		},

		update: (preferences: Partial<ConsentState>) => {
			if (preferences.analytics !== undefined) {
				state.analytics = preferences.analytics;
			}
			if (preferences.marketing !== undefined) {
				state.marketing = preferences.marketing;
			}
			state.responded = true;
			save();
		},

		reset: () => {
			state.analytics = false;
			state.marketing = false;
			state.responded = false;
			if (browser) {
				localStorage.removeItem(STORAGE_KEY);
			}
		}
	};
}

export const consentStore = createConsentStore();
